/* =====================================================================
   DRONE BATTERY GATE — two published lies, and one refusal to guess
   =====================================================================
   THE FIRST LIE IS A WRONG FIELD. Energy is capacity times the MEAN
   DISCHARGE voltage, but vendors sometimes print the CHARGED voltage in
   the same field, and the two differ by about 14 % on a LiPo. Both
   numbers come off the same page, so the error has no symptom.

   This gate audits every surveyed pack: does Ah x V_printed reproduce the
   published Wh? Four of five DJI packs agree to the digit. One does not,
   and the interesting part is that it is DIAGNOSABLE from DJI's own
   pages — the Mavic 3 prints the nominal and the charging limit as
   SEPARATE fields, which is what identifies 4.40 V/cell as a limit rather
   than a nominal when the TB60 puts it in the nominal's place.

   THE SECOND LIE IS AN OMISSION. Not one manufacturer page in this
   survey states a discharge cut-off or a usable fraction, yet every
   endurance figure depends on one. So `usableFraction` is a REQUIRED
   argument here with no default, and this gate checks that it still
   throws without one. A buried 0.8 would move every endurance number by
   20 % while looking like arithmetic. Two cited criteria are offered and
   they disagree in KIND — a capacity fraction and a cell voltage — which
   is the state of the published art, not something this tool resolves.

   THE THIRD THING IT GUARDS IS A CLAIM I ALMOST MADE. The three
   hover-basis aircraft cluster at 129-133 W/kg and the two largest sit at
   89-95, which invites "cruise-basis figures are lower". The sample
   refutes it: the Phantom 4 Pro V2 is also cruise-basis and lands at
   129.7, inside the hover cluster. What the two low aircraft actually
   share is SIZE. Basis and disc loading are confounded here and this
   sample cannot separate them, so the gate checks that the data file says
   so rather than letting the tidier story stand.
   ===================================================================== */
import {
  VEHICLES, VEHICLE_BATTERIES, VEHICLES_META, HOVER_BASIS_VEHICLES,
  CRUISE_BASIS_VEHICLES, VOLTAGE_FIELD_ANOMALIES, findVehicleBattery,
} from "../src/data/drone-vehicles.js";
import { BATTERIES } from "../src/data/drone-components.js";
import {
  packEnergyWh, usableEnergyWh, enduranceMin, voltageFieldAudit,
  dischargeLimitStatus, normalisePack, packFromCatalogue,
  USABLE_FRACTION_SOURCES, PER_CELL_V,
} from "../src/classes/drone/battery.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("DRONE BATTERY GATE");
console.log("=".repeat(78));

/* ── 1. PROVENANCE ─────────────────────────────────────────────────── */
check("the whole-vehicle truth set is present",
  VEHICLES.length >= 7 && VEHICLE_BATTERIES.length >= 7,
  `${VEHICLES.length} vehicles, ${VEHICLE_BATTERIES.length} packs`);

check("every vehicle and pack carries the URL it was read from",
  VEHICLES.every((v) => /^https?:\/\//.test(v.sourceUrl)) &&
  VEHICLE_BATTERIES.every((b) => /^https?:\/\//.test(b.sourceUrl)));

check("a rotor count nobody publishes is null, not inferred",
  VEHICLES.filter((v) => v.rotors == null).length >= 5,
  `${VEHICLES.filter((v) => v.rotors == null).length} of ${VEHICLES.length} vehicles ` +
  `do not state how many rotors they have — recorded as null, never guessed`);

/* ── 2. THE VOLTAGE-FIELD AUDIT ────────────────────────────────────── */
console.log("-".repeat(78));
console.log("  does Ah x V_printed reproduce the published Wh?");
console.log(`  ${"pack".padEnd(24)}${"Ah*V".padStart(9)}${"pub Wh".padStart(9)}` +
            `${"err".padStart(9)}${"V/cell".padStart(9)}`);
for (const b of VEHICLE_BATTERIES) {
  const a = b.audit;
  console.log(`  ${b.id.padEnd(24)}${a.ahTimesVprintedWh.toFixed(1).padStart(9)}` +
    `${(b.energyWhPublished ?? "-").toString().padStart(9)}` +
    `${(a.errorPct == null ? "-" : a.errorPct.toFixed(1) + "%").padStart(9)}` +
    `${(a.perCellPrintedV ?? 0).toFixed(2).padStart(9)}`);
}

check("exactly one surveyed pack's printed voltage contradicts its energy",
  VOLTAGE_FIELD_ANOMALIES.length === 1 && VOLTAGE_FIELD_ANOMALIES[0].id === "dji-tb60",
  `${VOLTAGE_FIELD_ANOMALIES[0].id} at ${VOLTAGE_FIELD_ANOMALIES[0].audit.errorPct.toFixed(1)} % — ` +
  `the other packs agree to the digit, so this is a defect and not a convention`);

const tb60 = findVehicleBattery("dji-tb60");
const mavic = findVehicleBattery("dji-mavic3");
check("the anomaly is diagnosable from the SAME vendor's own other page",
  Math.abs(tb60.audit.perCellPrintedV - (mavic.chargingVoltageLimitV / mavic.cellsSeries)) < 0.01,
  `TB60 prints ${tb60.audit.perCellPrintedV.toFixed(2)} V/cell; the Mavic 3 page separately ` +
  `prints "Charging Voltage Limit ${mavic.chargingVoltageLimitV} V" = ` +
  `${(mavic.chargingVoltageLimitV / mavic.cellsSeries).toFixed(2)} V/cell. Same number, named`);

check("and the published energy recovers the nominal the other packs use",
  Math.abs(tb60.audit.perCellImpliedV - (mavic.voltagePrintedV / mavic.cellsSeries)) < 0.01,
  `274 Wh over 5.935 Ah implies ${tb60.audit.perCellImpliedV.toFixed(2)} V/cell, matching the ` +
  `Mavic 3's stated nominal ${(mavic.voltagePrintedV / mavic.cellsSeries).toFixed(2)} V/cell`);

check("a per-cell voltage at or above the LiPo charged value is not a nominal",
  tb60.audit.perCellPrintedV >= PER_CELL_V.lipoCharged &&
  !(tb60.audit.perCellPrintedV <= PER_CELL_V.nominalBand[1]),
  `the ${PER_CELL_V.nominalBand.join("-")} V/cell band is what separates them`);

/* ── 3. THE MODULE HONOURS THE AUDIT ───────────────────────────────── */
console.log("-".repeat(78));
const eTb60 = packEnergyWh(tb60);
check("published energy is used even when the printed voltage disagrees",
  eTb60.wh === 274 && eTb60.source === "published",
  "the energy figure is not the one at fault");

check("and the disagreement is reported rather than absorbed",
  eTb60.warnings.length === 1 && eTb60.warnings[0].includes("charge limit"),
  "a caller is told the voltage field cannot be used for this pack");

check("a consistent pack produces no warning at all",
  packEnergyWh(mavic).warnings.length === 0 && packEnergyWh(mavic).wh === 77);

check("energy is DERIVED only when the voltage field looks like a nominal",
  (() => {
    const alta = findVehicleBattery("freefly-alta-x-pack");
    const e = packEnergyWh(alta);
    return e.source === "derived" && e.wh > 700 && e.warnings[0].includes("DERIVED");
  })(),
  "Freefly publishes no Wh but prints a genuine 3.70 V/cell nominal alongside a separate peak");

check("deriving from a charge-limit voltage is REFUSED, not attempted",
  (() => {
    const bad = { ...tb60, energyWhPublished: null };
    const e = packEnergyWh(bad);
    return e.wh === null && e.source === "unavailable" && e.warnings[0].includes("Refused");
  })(),
  "with no published Wh and 4.40 V/cell printed, the module returns null and says why");

/* ── 4. USABLE FRACTION IS DECLARED, NEVER ASSUMED ─────────────────── */
console.log("-".repeat(78));
check("usableFraction has NO default — the call throws without one",
  (() => { try { usableEnergyWh(tb60, {}); return false; } catch (e) { return /declared explicitly/.test(e.message); } })(),
  "no manufacturer in this survey publishes a cut-off, so there is no defensible default");

check("an out-of-range usable fraction is refused",
  (() => { try { usableEnergyWh(tb60, { usableFraction: 1.4 }); return false; } catch { return true; } })());

check("two cited criteria are offered, and they disagree in KIND",
  USABLE_FRACTION_SOURCES.length === 2 &&
  USABLE_FRACTION_SOURCES.some((s) => s.basis === "capacity fraction") &&
  USABLE_FRACTION_SOURCES.some((s) => s.basis === "cell voltage" && s.value === null),
  "Dai's 0.85 capacity fraction vs Bauersfeld's 3.5 V/cell — the latter carries no " +
  "fraction because converting it needs a discharge curve nobody publishes");

const u = usableEnergyWh(tb60, { usableFraction: 0.85, packs: 2 });
check("usable energy scales with pack count and the declared fraction",
  Math.abs(u.totalWh - 548) < 1e-9 && Math.abs(u.usableWh - 548 * 0.85) < 1e-9,
  `2 x 274 Wh = ${u.totalWh} Wh, ${u.usableWh.toFixed(1)} Wh usable at 0.85`);

const end = enduranceMin({ usableWh: u.usableWh, powerW: 600 });
check("endurance names every simplification it rests on",
  end.assumes.length >= 4 && end.assumes.some((a) => /Peukert/.test(a)),
  `${end.minutes.toFixed(1)} min at 600 W — constant power, fresh pack, room temperature, no rate derating`);

/* ── 5. DISCHARGE LIMITS ───────────────────────────────────────────── */
check("an unpublished discharge limit reads as unknown, never as a pass",
  (() => {
    const s = dischargeLimitStatus({ capacityMah: 5000, energyWhPublished: 77 }, 40);
    return s.within === null && s.stated === false;
  })());

check("a published discharge limit is enforced, and the C rate is reported",
  (() => {
    const cell = BATTERIES.find((b) => b.max_continuous_discharge_a > 0);
    const s = dischargeLimitStatus(cell, cell.max_continuous_discharge_a * 2);
    return s.within === false && s.cRateDemanded > 0;
  })());

/* ── 6. ONE PACK SHAPE FROM TWO SOURCES ────────────────────────────── */
console.log("-".repeat(78));
let catOk = 0;
for (const b of BATTERIES) {
  const p = packFromCatalogue(b);
  if (p.capacityMah != null || p.energyWhPublished != null) catOk++;
}
check("every catalogue pack converts into the module's shape",
  catOk === BATTERIES.length,
  `${catOk} of ${BATTERIES.length} — the catalogue is snake_case, the truth set camelCase, ` +
  `and reading the wrong field would silently report "not published"`);

check("an unrecognised pack shape is refused rather than silently hollow",
  (() => { try { normalisePack({ id: "x", volts: 12 }); return false; } catch (e) { return /unrecognised pack shape/.test(e.message); } })());

check("the computed C rating is kept separate from a published one",
  (() => {
    const cell = BATTERIES.find((b) => b.c_rating_continuous == null && b.c_rating_continuous_computed > 0);
    if (!cell) return true;
    const p = packFromCatalogue(cell);
    return p.cRatingContinuous == null && p.cRatingContinuousComputed > 0;
  })(), "a computed rating must never become a vendor claim the vendor never made");

/* ── 7. HOVER AND CRUISE ARE DIFFERENT QUANTITIES ──────────────────── */
console.log("-".repeat(78));
console.log("  implied power at FULL pack — an upper bound, since no vendor");
console.log("  here states a usable fraction:");
console.log(`  ${"vehicle".padEnd(24)}${"basis".padStart(10)}${"W/kg".padStart(9)}`);
for (const v of [...VEHICLES].sort((a, b) => (a.impliedPowerWPerKg ?? 0) - (b.impliedPowerWPerKg ?? 0)))
  if (v.impliedPowerWPerKg)
    console.log(`  ${v.model.padEnd(24)}${v.enduranceBasis.padStart(10)}` +
                `${v.impliedPowerWPerKg.toFixed(1).padStart(9)}`);

check("hover-basis vehicles are separated from cruise-basis ones",
  HOVER_BASIS_VEHICLES.length === 3 && CRUISE_BASIS_VEHICLES.length === 3,
  `${HOVER_BASIS_VEHICLES.length} publish a hover time, ${CRUISE_BASIS_VEHICLES.length} publish ` +
  `only a "max flight time", 1 states no basis at all`);

check("every hover-basis vehicle quotes a hover time in its own words",
  HOVER_BASIS_VEHICLES.every((v) => v.hoverTimeMin > 0 && v.hoverTimeWording));

const hp = HOVER_BASIS_VEHICLES.map((v) => v.impliedPowerWPerKg);
check("the hover-basis set is tight enough to be worth scoring against",
  Math.max(...hp) - Math.min(...hp) < 10,
  `${Math.min(...hp).toFixed(1)}-${Math.max(...hp).toFixed(1)} W/kg across three aircraft ` +
  `from two manufacturers`);

/* THE CLAIM THE SAMPLE REFUTES. */
const p4p = VEHICLES.find((v) => v.id === "dji-phantom-4-pro-v2");
check("basis alone does NOT explain the low cluster, and the file says so",
  p4p.enduranceBasis === "cruise" && p4p.impliedPowerWPerKg > Math.min(...hp) - 5 &&
  VEHICLES_META.enduranceBasisRule.length > 0,
  `the Phantom 4 Pro V2 is cruise-basis at ${p4p.impliedPowerWPerKg.toFixed(1)} W/kg, inside the ` +
  `hover cluster — the two low aircraft are also the two LARGEST, so basis and disc ` +
  `loading are confounded in this sample`);

check("no vehicle's pack energy was derived where the vendor published one",
  VEHICLES.every((v) => !v.packEnergyIsDerived || findVehicleBattery(v.batteryId).energyWhPublished == null));

console.log("=".repeat(78));
console.log(fail === 0 ? `DRONE BATTERY GATE PASSED (${pass} checks)`
                       : `DRONE BATTERY GATE FAILED: ${fail} check(s)`);
process.exit(fail === 0 ? 0 : 1);
