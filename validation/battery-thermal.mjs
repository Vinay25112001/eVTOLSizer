/* =====================================================================
   BATTERY THERMAL / BTMS GATE
   =====================================================================
   WHY THIS FILE EXISTS.

   `src/engine/battery-thermal.js` sizes the cooling loop, the BMS, the pack
   installation and the thermal-runaway protection. It has shipped for some
   time and it appeared in exactly ONE place in validation/: as a frozen row
   inside golden-master.snapshot.json. That freezes it against CHANGE. It
   never once compared it against anything PUBLISHED.

   In a project whose whole credibility argument is "every model is measured
   against published data", this was one of two models that were not. The
   other is acoustics — see validation/acoustics.mjs, written with it.

   WHAT CAN ACTUALLY BE CHECKED HERE, AND WHAT CANNOT.

   The installation half of this model rests on a genuine published artifact:
   EASA MOC SC-VTOL Issue 2, MOC VTOL.2325(a)(4) tabulates ultimate inertial
   load factors for retaining an energy storage system, and the numbers differ
   by location. That is a table with fifteen entries, and either the model
   reproduces it or it does not.

   The transient half rests on a closed-form solution, dT = (Qgen-Qrej) t/(m cp),
   which this gate recomputes independently rather than trusting.

   The MASS half largely cannot be validated and this gate says so out loud
   instead of implying otherwise: btmsKgPerKW is [CAL], anchored on a single
   published 46 kg system, and the two thermal-runaway fractions are [LAY]
   with no published mass data behind them at all. A gate that scored those
   against themselves would be theatre.
   ===================================================================== */
import { batteryThermal, PACK_LOAD_FACTORS, THERMAL_CONSTANTS }
  from "../src/engine/battery-thermal.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("BATTERY THERMAL / BTMS GATE");
console.log("=".repeat(76));
console.log("  EASA MOC SC-VTOL Issue 2, MOC VTOL.2325(a)(4) 'Energy storage system");
console.log("  load factors' — ULTIMATE inertial factors, quoted in the model header.");
console.log("");

/* ── 1. THE PUBLISHED LOAD-FACTOR TABLE, ALL FIFTEEN ENTRIES ──────────
   Transcribed here from the MOC text quoted verbatim in the model's own
   header, and compared against what the model actually carries. Written out
   in full rather than looped over the model's keys, because a test that
   reads its expectations from the thing under test proves nothing. */
const MOC_VTOL_2325 = {
  cabin:    { up: 4.0, fwd: 16.0, side: 8.0, down: 20.0, aft: 1.5 },
  adjacent: { up: 1.5, fwd: 12.0, side: 6.0, down: 12.0, aft: 1.5 },
  other:    { up: 1.5, fwd: 4.0,  side: 2.0, down: 4.0,  aft: 1.5 },
};
const wrong = [];
for (const [loc, want] of Object.entries(MOC_VTOL_2325))
  for (const [dir, v] of Object.entries(want)) {
    const got = PACK_LOAD_FACTORS[loc]?.[dir];
    if (got !== v) wrong.push(`${loc}.${dir} ${got} != ${v}`);
  }
check(wrong.length === 0,
  "all 15 published load factors reproduced exactly",
  wrong.length ? wrong.join("; ")
    : "cabin 4/16/8/20/1.5, above-or-adjacent 1.5/12/6/12/1.5, other 1.5/4/2/4/1.5 "
    + "(up/fwd/side/down/aft) — the MOC's own numbers, not a fit to them");

/* ── 2. THE CONSEQUENCE THE MOC IS ACTUALLY MAKING ───────────────────
   The point of the table is that WHERE the pack goes changes the mount loads
   by a factor of five. If the model carried the numbers but did not act on
   them, item 1 would still pass. */
const g0 = { Wbat: 900, PackkWh: 300, Pheat: 60000, PheatCruise: 9000,
             Nseries: 140, Ncells: 3600, tHoverS: 240 };
const byLoc = Object.fromEntries(["cabin", "adjacent", "other"]
  .map(L => [L, batteryThermal({ packLocation: L }, g0)]));
check(byLoc.cabin.nGoverning === 20 && byLoc.adjacent.nGoverning === 12
      && byLoc.other.nGoverning === 4,
  "the governing factor is the worst direction for that location",
  `cabin ${byLoc.cabin.nGoverning} g, adjacent ${byLoc.adjacent.nGoverning} g, `
  + `other ${byLoc.other.nGoverning} g — downward governs all three, and cabin/other is `
  + `exactly the 5x the MOC imposes`);
/* THE LOAD PATH IS WIRED, BUT IT IS DORMANT AT A TYPICAL PACK SIZE, AND THIS
   GATE FOUND THAT ON ITS FIRST RUN. At 900 kg the mounts come out 7.71 kg for
   all three locations — identical at 20 g, 12 g and 4 g. The reason is exact
   rather than approximate:

     M_tray = 0.048 w L^2  with  w = n m g / A  and  L^2 = A
            = 0.048 n m g                        <- the FOOTPRINT CANCELS

   so the face thickness depends on n*m alone, and the 0.5 mm minimum gauge
   governs until n*m is large. Measured thresholds:

     cabin (20 g)  leaves minimum gauge above a  929 kg pack
     other (4 g)   would need a                 4647 kg pack

   Minimum gauge is a real constraint and this is a legitimate physical
   result, not a coding error. But the model's header claimed the tool "can
   now show" the five-fold location decision, and at any pack an eVTOL of this
   class actually carries, it cannot: two of the three locations are gauge-
   governed at every realistic size. That claim is corrected in the model.

   So the check is split. Non-decreasing must hold ALWAYS; strictly increasing
   is required only where the structure is load-governed, which proves the
   path is connected rather than merely present. */
check(byLoc.cabin.mounts >= byLoc.adjacent.mounts
      && byLoc.adjacent.mounts >= byLoc.other.mounts,
  "mount mass never decreases as the published load factor rises",
  `${byLoc.cabin.mounts.toFixed(2)} >= ${byLoc.adjacent.mounts.toFixed(2)} >= `
  + `${byLoc.other.mounts.toFixed(2)} kg at 900 kg — all three EQUAL here because the `
  + `0.5 mm minimum face gauge governs below a 929 kg pack, not because the load `
  + `factor is ignored`);

const big = { ...g0, Wbat: 2000 };
const byLocBig = Object.fromEntries(["cabin", "adjacent", "other"]
  .map(L => [L, batteryThermal({ packLocation: L }, big)]));
check(byLocBig.cabin.mounts > byLocBig.adjacent.mounts
      && byLocBig.adjacent.mounts > byLocBig.other.mounts,
  "and it responds strictly once the tray is load-governed rather than gauge-governed",
  `at a 2000 kg pack: ${byLocBig.cabin.mounts.toFixed(1)} > `
  + `${byLocBig.adjacent.mounts.toFixed(1)} > ${byLocBig.other.mounts.toFixed(1)} kg — the `
  + `SC-VTOL factors do reach the mass, they are simply dormant under minimum gauge at `
  + `the sizes this class of aircraft flies`);

/* ── 3. THE TRANSIENT, RECOMPUTED FROM THE CLOSED FORM ────────────────
   dT = (Q_gen - Q_rej) t / (m cp) is stated in the header. This computes it
   here, from the model's own reported Q's and constants, and compares. If the
   integration ever stops being the thing the comment claims, this catches it. */
const r = batteryThermal({ packLocation: "other" }, g0);
const dTclosed = Math.max(0, r.QhovW - r.QrejectW) * g0.tHoverS
               / (g0.Wbat * THERMAL_CONSTANTS.cpCell);
check(near(r.dTHoverK, dTclosed, 1e-9),
  "the hover temperature rise IS the lumped-mass closed form",
  `${r.dTHoverK.toFixed(4)} K against ${dTclosed.toFixed(4)} K recomputed here from `
  + `(Q_gen ${(r.QhovW / 1000).toFixed(1)} kW - Q_rej ${(r.QrejectW / 1000).toFixed(1)} kW) `
  + `x ${g0.tHoverS} s / (${g0.Wbat} kg x ${THERMAL_CONSTANTS.cpCell} J/kgK)`);

/* Linearity in both variables — properties of the closed form, not of a fit. */
const rT2 = batteryThermal({ packLocation: "other" }, { ...g0, tHoverS: 480 });
const rM2 = batteryThermal({ packLocation: "other" }, { ...g0, Wbat: 1800 });
check(near(rT2.dTHoverK, 2 * r.dTHoverK, 1e-9),
  "doubling the hover segment doubles the rise",
  `${r.dTHoverK.toFixed(3)} K at 240 s -> ${rT2.dTHoverK.toFixed(3)} K at 480 s`);
check(rM2.dTHoverK < r.dTHoverK,
  "and a heavier pack rises less for the same heat",
  `${r.dTHoverK.toFixed(3)} K at 900 kg -> ${rM2.dTHoverK.toFixed(3)} K at 1800 kg — the `
  + `pack's own thermal mass is what makes a short hot segment survivable`);

/* ── 4. FIRST LAW: no rise when rejection covers generation ───────────── */
const rCold = batteryThermal({ packLocation: "other", btmsHoverFraction: 1.0 }, g0);
check(rCold.dTHoverK === 0,
  "a pack whose cooling matches its heat does not warm up",
  `Q_rej ${(rCold.QrejectW / 1000).toFixed(1)} kW >= Q_gen `
  + `${(rCold.QhovW / 1000).toFixed(1)} kW gives dT = 0 exactly — the max(0,...) is not `
  + `hiding a negative`);

/* ── 5. PUBLISHED BOUNDS THE MODEL CLAIMS TO RESPECT ──────────────────
   Li-ion pack lumped specific heat is quoted in the header as 1000-1100
   J/(kg K); the published eVTOL liquid-cooling band is "less than 20% of the
   pack". The second is enforced as a cap, so it needs a case that would
   otherwise breach it — a small pack with a very large heat load. */
check(THERMAL_CONSTANTS.cpCell >= 1000 && THERMAL_CONSTANTS.cpCell <= 1100,
  "the specific heat sits inside the published Li-ion band",
  `${THERMAL_CONSTANTS.cpCell} J/(kg K) within 1000-1100`);

const rHot = batteryThermal({ packLocation: "other" },
  { ...g0, Wbat: 120, Pheat: 400000, PheatCruise: 300000 });
check(rHot.btmsCapped && rHot.btmsFracPack <= THERMAL_CONSTANTS.btmsMaxFracPack + 1e-12,
  "the 20%-of-pack cooling bound is ENFORCED, not merely documented",
  `a 120 kg pack rejecting ${(rHot.QrejectW / 1000).toFixed(0)} kW wants more cooling than `
  + `that bound allows; the model caps at ${(100 * rHot.btmsFracPack).toFixed(1)}% and `
  + `reports btmsCapped — an absurd cooling system cannot be produced silently`);

/* ── 6. THE MOC'S OWN ORDERING ON THERMAL RUNAWAY ─────────────────────
   MOC VTOL.2440 warns that the containment route penalises energy/weight
   "unduly and substantially" relative to the protection-layers route. That is
   an ORDERING, and it is the one thing the two [LAY] fractions must get
   right. The model's header records that an earlier version INVERTED it —
   mixing a per-module barrier mass with a per-area enclosure mass — which
   made non-propagation the heavier of the two and stood the MOC's point on
   its head. Nothing was testing that then. */
const rCon = batteryThermal({ packLocation: "other", trStrategy: "containment" }, g0);
const rNon = batteryThermal({ packLocation: "other", trStrategy: "nonPropagation" }, g0);
check(rCon.containment > rNon.containment,
  "containment is heavier than non-propagation, as MOC VTOL.2440 says",
  `${rCon.containment.toFixed(1)} kg vs ${rNon.containment.toFixed(1)} kg — the ordering `
  + `is the only part of these two [LAY] fractions that is sourced, and it is the part `
  + `an earlier version had backwards`);

/* ── 7. THE TEMPERATURE LIMIT IS A LIMIT ──────────────────────────────
   Bracketed: one case that must pass the 55 C threshold and one that must
   fail it, so the flag is shown to move rather than to be always true. */
const rOK  = batteryThermal({ packLocation: "other" }, g0);
const rBad = batteryThermal({ packLocation: "other" },
  { ...g0, Pheat: 900000, PheatCruise: 1000, tHoverS: 600 });
check(near(rOK.tPeakC, THERMAL_CONSTANTS.tAmbientC + rOK.dTHoverK, 1e-9)
      && rOK.withinMax && !rBad.withinMax,
  "the 55 C cell limit is bracketed — one case inside it, one outside",
  `peak ${rOK.tPeakC.toFixed(1)} C passes and ${rBad.tPeakC.toFixed(1)} C does not, `
  + `against the published ${THERMAL_CONSTANTS.tCellMaxC} C threshold; peak is ambient `
  + `${THERMAL_CONSTANTS.tAmbientC} C plus the computed rise, with nothing added`);

/* ── WHAT THIS GATE DOES NOT ESTABLISH ────────────────────────────────
   Stated here rather than left for a reader to work out, because the gap is
   the point of the file. */
console.log("");
console.log("  WHAT IS **NOT** VALIDATED HERE, AND WHY:");
console.log(`    btmsKgPerKW = ${THERMAL_CONSTANTS.btmsKgPerKW} kg/kW is [CAL]: anchored on ONE`);
console.log("    published 46 kg system. A single datum fixes a constant; it does not");
console.log("    validate a model, and no second independent cooling mass was found.");
console.log(`    containmentFracPack ${THERMAL_CONSTANTS.containmentFracPack} and`);
console.log(`    nonPropagationFracPack ${THERMAL_CONSTANTS.nonPropagationFracPack} are [LAY].`);
console.log("    MOC VTOL.2440 gives the ORDERING and no number, so only the ordering is");
console.log("    gated above. The magnitudes are placeholders and are labelled as such.");
console.log("    The installation half rests on a real published table; the mass half");
console.log("    does not, and this gate does not pretend the two are the same kind of");
console.log("    evidence.");

console.log("");
if (fails) { console.log(`BATTERY THERMAL / BTMS GATE FAILED: ${fails}`); process.exit(1); }
console.log("BATTERY THERMAL / BTMS GATE PASSED");
