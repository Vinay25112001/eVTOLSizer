/* =====================================================================
   TAIL GEOMETRY — the first validation of anything in the stability chain
   =====================================================================
   WHY THIS EXISTS

   A census of the provenance registry found that EVERY stability and
   control output in this tool is unverified: tail areas (Sh_req, Sh_eff,
   Sv_req, Sv_eff, Srv), V-tail geometry (Cr_vt, Ct_vt, bvt_panel,
   sweep_vt, vtGamma_opt), the tail arm (lv), static margin (smMin, smMax,
   targetSM), control authority (pitch_ratio, yaw_ratio, delta_rv_deg,
   ruddervator_combined_auth) and the V-n envelope (Vstall, VA, VD).
   Nothing in that list had ever been compared to an aircraft. The two
   files that mentioned any of it were the golden master, which only
   records numbers, and the identities harness, which only checks they are
   self-consistent.

   A survey of what is publicly available found:
     - CG position or range for an eVTOL: NOTHING, in 857 corpus papers or
       from any manufacturer. That part of the chain cannot be validated
       and this project should stop implying it is merely pending.
     - Static margin: ONE number (10.3%, a tilt-duct concept). Not a set.
     - Tail AREAS: three aircraft with exact geometry, already shipped in
       this repo as OpenVSP models and never used.

   This harness uses that third thing. It is not much, and it is the first
   time any part of the stability chain has been checked against an
   aircraft rather than against itself.

   THE HONEST CAVEAT, STATED UP FRONT: RAVEN, SWFT and BD-6 are RELATED.
   BD-6 is the donor airframe and SWFT is a RAVEN variant, so they share
   design conventions and their agreement is weaker evidence than three
   independent designs. Two related aircraft is what exists.

   Run: node validation/tail-geometry.mjs
   ===================================================================== */
import { VSP_MODELS } from "../src/data/vsp-models.js";

const bar = "=".repeat(78);
const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label);
};

console.log("TAIL GEOMETRY VALIDATION");
console.log(bar);

/* Surface areas and arms resolved from the .vsp3 parent chain. The raw
   X_Rel_Location is PARENT-relative, which is why the RAVEN stabilator first
   appeared to sit 1.4 m AHEAD of the wing - it hangs off a Stab-Hinge that
   hangs off the fuselage. Resolving the chain puts it 3.07 m behind. */
const MEASURED = {
  raven: { S: 4.895,   b: 6.089,   MAC: 0.8039, Sh: 1.090,  lh: 3.071, Sv: 0.8392, lv: 2.039 },
  swft:  { S: 58.1211, b: 20.8971, MAC: 2.7813, Sh: 11.707, lh: 9.651, Sv: 9.4244, lv: 7.592 },
};

const Vh = (d) => d.Sh * d.lh / (d.S * d.MAC);
const Vv = (d) => d.Sv * d.lv / (d.S * d.b);

console.log("\nTAIL VOLUME COEFFICIENTS, measured from NASA's own OpenVSP geometry");
console.log("   Vh = Sh lh / (S MAC)      Vv = Sv lv / (S b)");
const vhs = [], vvs = [];
for (const [k, d] of Object.entries(MEASURED)) {
  const h = Vh(d), v = Vv(d);
  vhs.push(h); vvs.push(v);
  console.log(`   ${k.toUpperCase().padEnd(6)} Vh ${h.toFixed(4)}   Vv ${v.toFixed(4)}` +
              `   (Sh ${d.Sh} m2 at ${d.lh} m, Sv ${d.Sv} m2 at ${d.lv} m)`);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const mVh = mean(vhs), mVv = mean(vvs);
console.log(`   mean   Vh ${mVh.toFixed(4)}   Vv ${mVv.toFixed(4)}`);

/* ── THE COEFFICIENTS DO NOT TRANSFER, AND THAT IS THE POINT ───────────
   These measurements were briefly adopted as the tool's defaults and then
   reverted. A tail volume coefficient trades AREA against ARM - V = S_t l /
   (S_w b) - so it only carries between aircraft of similar proportion, and
   these two are not proportioned like an air taxi:

     fuselage / span    RAVEN 0.740   SWFT 0.749
                        Joby S4 0.538   this tool 0.540

   RAVEN and SWFT are a small research-aircraft family: long body, short
   span. Imposing their tail VOLUME on our ARM demanded a V-tail of 81.6% of
   wing area. No aircraft has that; NASA's own carry 36-39%. The defaults
   stayed at 0.45 / 0.032 and stayed tagged unverified.

   What the measurement bought was knowing WHY they cannot be improved that
   way - worth more than a number that makes one check pass. */
const DEFAULT_VTCH = 0.45, DEFAULT_VTCV = 0.032;
check(DEFAULT_VTCH < mVh && DEFAULT_VTCV < mVv,
  "the tool's coefficients are recorded as BELOW NASA's measured values",
  `ours ${DEFAULT_VTCH} / ${DEFAULT_VTCV} vs measured ${mVh.toFixed(3)} / ${mVv.toFixed(4)} - ` +
  `not adopted, because fuselage/span is 0.54 here against 0.74 there`);

/* ── AREA RATIOS, which need no tail arm and so are independent of the
      parent-chain resolution above ───────────────────────────────────── */
console.log("\nAREA RATIOS (independent of the arm, so a separate check)");
const ratios = [];
for (const [k, m] of Object.entries(VSP_MODELS)) {
  const S = m.wing?.area_m2;
  const t = m.tails || [];
  const h = t.find(x => /stabilator|horizontal/i.test(x.name));
  const v = t.find(x => /^vertical/i.test(x.name));
  if (!S || !h || !v) continue;
  ratios.push({ k, sh: h.area_m2 / S, sv: v.area_m2 / S });
  console.log(`   ${k.toUpperCase().padEnd(6)} Sh/S ${(h.area_m2 / S).toFixed(3)}   Sv/S ${(v.area_m2 / S).toFixed(3)}`);
}
const spread = (xs) => (Math.max(...xs) - Math.min(...xs)) / mean(xs);
check(ratios.length >= 3, "three published models carry a usable tail", `${ratios.length} found`);
check(spread(ratios.map(r => r.sh)) < 0.15,
  "horizontal tail area is a consistent fraction of wing area across them",
  `Sh/S spread ${(100 * spread(ratios.map(r => r.sh))).toFixed(1)}% about ${mean(ratios.map(r => r.sh)).toFixed(3)}`);
check(spread(ratios.map(r => r.sv)) < 0.15,
  "and so is vertical tail area",
  `Sv/S spread ${(100 * spread(ratios.map(r => r.sv))).toFixed(1)}% about ${mean(ratios.map(r => r.sv)).toFixed(3)}`);

/* ── THE ACTUAL VALIDATION: our SIZED tail against their BUILT tail ─────
   Tail area as a fraction of wing area needs no arm to MEASURE, which is
   why it can be read off a built aircraft. It is not independent of the
   arm to SIZE. The engine sizes it as

       Svt / S = (Ch MAC + Cv b) / lv,     lv = 0.88 fL - x_AC,wing

   so at the same coefficients a longer body gives a smaller tail, and the
   fraction carries between aircraft only at the same PROPORTION. The tool's
   own lift+cruise demonstrated that. Its body is grown to carry its rotor
   array (engine.js: D / fL <= 0.4293), which puts its fuselage/span at 0.75
   - RAVEN's and SWFT's proportion - and its tail at 26% of wing area,
   against 34-35% for the three layouts that keep the 7.2 m body at
   fuselage/span 0.55-0.57. Same coefficients, same arm rule, one proportion
   apart. This block used to claim the fraction "transfers between aircraft
   of different proportion" and held all four layouts in one band; that band
   held only because the lift+cruise sat 0.3 points above its lower edge,
   and the rotor group taking NASA's deck inputs (heavier group, larger
   solved rotor, longer body) moved it 0.9 points and out.

   So the comparison is made where it is like for like:

     - a layout AT NASA's proportion compares directly. The lift+cruise
       sizes 26% against their built 36-39%: a quarter to a third smaller. That is the image
       of the coefficient deficit the first block records (0.45 / 0.032
       against 0.775 / 0.058 measured) and declines to adopt, offset in
       part by where the arm is taken. The check asserts the DIRECTION,
       below, as the first block does, so it trips if the coefficients or
       the arm rule change it.

     - the layouts at the tool's own proportion keep the band they had.
       Their agreement with NASA's fraction is at a different proportion and
       is reported with the proportion beside it.

   Bounds from the failure mode. Eight sizing mutants were run (arm taken
   from the nose, Sv on MAC, Sh on span, one panel reported as the total,
   Ch/Cv swapped, sized at a fixed 45 deg, tail AC at 0.806 fL, arm 0.45 fL).
   On the lift+cruise the innocent 26.3% has its nearest low-side defect at
   17.5% (Sv on MAC) and its nearest high-side at 31.8% (tail AC at the
   leading edge); the floor of 22% sits between the innocent value and the
   low side. The high-side defects on the lift+cruise stay below NASA's
   minimum and are not caught here; the golden master freezes Svt_total on
   every default vehicle and catches all eight. On the other three layouts
   the mutants land at 12.8-23.2% and 40.8-43.4% against innocent
   33.9-34.9%: the band's lower edge (26.9%) catches the low side, its upper
   edge (53%) catches only the two gross errors (150-199%), and the
   fixed-45-degree defect narrated below (43.4%) has never been caught by
   it. Recorded, not changed here: the golden master is where that defect
   is caught.

   It only lands where it does because the V-tail is sized at its own
   optimal dihedral. That optimum had been computed and used ONLY to DRAW the
   tail while the sizing kept a fixed 45 degrees - so the tool sized one tail
   and drew another, and every tail area and mass it reported belonged to
   neither. Sizing at the optimum drops the V-tail from 46.1% to 37.1% of
   wing area on the tool's default.

   The agreement is independent: our angle comes from OUR Cv/Ch, theirs from
   a tape measure on a different aircraft. */
const { runSizing } = await import("../src/engine.js");
const CFG = await import("../src/engine/configuration.js");
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };
const built = ratios.map(r => r.sh + r.sv);
const lo = Math.min(...built), hi = Math.max(...built);
/* RAVEN 0.740, SWFT 0.749 (fuselage length / span; the first block). A layout
   within 0.05 of that range is compared directly; 0.05 is a fifth of the gap
   to the tool's own 0.55-0.57, so nothing sits on the line. */
const NASA_PROPORTION = { lo: 0.740, hi: 0.749, tol: 0.05 };
const LC_FLOOR = 0.22;   // between the 17.5% nearest defect and the 26.3% innocent value
console.log(`
OUR SIZED V-TAIL vs THEIR BUILT TAIL (area fraction, with fuselage/span beside it because the fraction depends on it)`);
console.log(`   NASA built total tail / wing: ${(100 * lo).toFixed(1)}% to ${(100 * hi).toFixed(1)}%   at fuselage/span ${NASA_PROPORTION.lo.toFixed(2)}-${NASA_PROPORTION.hi.toFixed(2)}`);
const rows = {};
for (const key of ["liftcruise", "hybrid", "hybridPusher", "tiltrotor"]) {
  const d = CFG.CONFIG_DEFAULTS[key];
  const R = runSizing({ ...B, configType: key, nPropHover: d.nRotors,
    /* SOLVED, not evaluated at a placeholder MTOW. The old call used a
       hardcoded 3175 kg while the aircraft converged elsewhere, leaving the
       disk loading up to 35% off its target - see configuration.js. */
    propDiam: (CFG.solveRotorDiameter(key, { ...B, configType: key, nPropHover: d.nRotors },
      runSizing)?.propDiam) ?? CFG.rotorDiameterFor(key, 3175, d.nRotors),
    vCruise: d.vCruise_ms ?? B.vCruise, LD: d.LD_target ?? B.LD,
    etaHov: d.etaHov ?? B.etaHov, tipSpeed: d.tipSpeed_ms ?? B.tipSpeed,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2: d.wingLoadingNm2 } : {}) });
  const frac = (R.Svt_total || 0) / (R.Swing || 1);
  const prop = (R.fusLen || 0) / (R.bWing || 1);
  const atNasa = prop >= NASA_PROPORTION.lo - NASA_PROPORTION.tol && prop <= NASA_PROPORTION.hi + NASA_PROPORTION.tol;
  rows[key] = { frac, prop, atNasa };
  console.log(`   ${key.padEnd(14)} ${(100 * frac).toFixed(1)}%   fuselage/span ${prop.toFixed(3)}` +
              `${atNasa ? "  <- NASA's proportion" : ""}   (dihedral ${R.vtGamma_opt} deg, sized and drawn` +
              `${R.fusLenGrownForRotors ? `; body grown from ${B.fusLen} m to carry the rotor array` : ""})`);
}
const direct = Object.entries(rows).filter(([, r]) => r.atNasa);
const own = Object.entries(rows).filter(([, r]) => !r.atNasa);
check(direct.length >= 1,
  "at least one layout sits at NASA's proportion, so the comparison is made like for like somewhere",
  direct.map(([k, r]) => `${k} ${r.prop.toFixed(3)}`).join(", ") || "none - every layout is at the tool's proportion");
const wrongWay = direct.filter(([, r]) => !(r.frac < lo && r.frac > LC_FLOOR));
check(wrongWay.length === 0,
  "at NASA's proportion the tool's tail is SMALLER than NASA's built tails, and above the floor a sizing defect would breach",
  direct.map(([k, r]) => `${k} ${(100 * r.frac).toFixed(1)}% against ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}%` +
    ` (${(100 * (1 - r.frac / lo)).toFixed(0)}% below their smallest; floor ${(100 * LC_FLOOR).toFixed(0)}%)`).join(", "));
const outside = own.filter(([, r]) => r.frac < lo * 0.75 || r.frac > hi * 1.35).map(([k, r]) => `${k} ${(100 * r.frac).toFixed(1)}%`);
check(outside.length === 0,
  "at the tool's own proportion every winged layout's V-tail area fraction sits near NASA's built aircraft",
  outside.length ? outside.join(", ")
    : `${own.length} inside ${(100 * lo * 0.75).toFixed(0)}-${(100 * hi * 1.35).toFixed(0)}%, around their ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}% - at fuselage/span ${own.map(([, r]) => r.prop.toFixed(2)).join("/")}, not theirs`);

console.log(`\nWHAT THIS DOES NOT VALIDATE, and cannot:`);
console.log(`   CG position or range   - no eVTOL publishes it. Zero sources found.`);
console.log(`   static margin          - one published number in 857 papers.`);
console.log(`   control authority      - no published deflections or hinge moments.`);
console.log(`   V-n envelope           - no published VA / VD for any eVTOL.`);
console.log(`   Those stay unverified, and VALIDATION.md now says so rather than`);
console.log(`   leaving them looking like work merely not yet done.`);

console.log(`\n${bar}`);
console.log(fails.length ? `TAIL GEOMETRY VALIDATION: ${fails.length} FAILED` : "TAIL GEOMETRY VALIDATION PASSED");
process.exit(fails.length ? 1 : 0);
