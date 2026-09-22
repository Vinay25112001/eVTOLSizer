/* =====================================================================
   TOTAL-RANGE GATE — every caller hands the engine the range it was asked
   =====================================================================
   The engine is given ONE total range (mission + reserve distance) and
   subtracts the reserve distance to recover the mission leg. Whoever builds
   that total must use the same reserve the engine will subtract, or the
   difference silently becomes cruise distance.

   Nine places used to build it themselves, with `reserveMinutes || 20`
   while the engine reads `?? 20`: a 0-minute reserve showed as 20 on the
   slider and added 20 minutes of reserve distance to the mission. The
   sensitivity panel also added the reserve at the unperturbed cruise speed
   while the engine subtracted it at the perturbed one, and two callers
   ignored the distance basis. All of them now call engineInputs().

   Checks:
   1. engineInputs() round-trips: the engine's missionRange is the range
      asked for, and its reserve is the one asked for, for both bases.
   2. That holds with cruise speed changed, as the sensitivity panel does.
   3. No source file builds the total range, or defaults reserveMinutes
      with `||`, outside src/lib/designfile.js.
   ===================================================================== */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { runSizing } from "../src/engine.js";
import { engineInputs, resolveInputs } from "../src/lib/designfile.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("TOTAL-RANGE GATE");
console.log("=".repeat(72));

/* ── 1. round trip, both bases ──────────────────────────────────────── */
const cases = [
  { label: "time basis, 0 min",       in: { reserveBasis: "time", reserveMinutes: 0 },  minutes: 0 },
  { label: "time basis, 20 min",      in: { reserveBasis: "time", reserveMinutes: 20 }, minutes: 20 },
  { label: "time basis, 45 min",      in: { reserveBasis: "time", reserveMinutes: 45 }, minutes: 45 },
  { label: "distance basis, 0 km",    in: { reserveBasis: "distance", reserveDistanceKm: 0 } },
  { label: "distance basis, 60 km",   in: { reserveBasis: "distance", reserveDistanceKm: 60 } },
  { label: "cruise speed +10%",       in: { reserveMinutes: 20 }, vScale: 1.1, minutes: 20 },
  { label: "cruise speed -10%",       in: { reserveMinutes: 20 }, vScale: 0.9, minutes: 20 },
  { label: "tiltrotor, 0 min",        in: { configType: "tiltrotor", reserveMinutes: 0 }, minutes: 0 },
  { label: "marketing basis, reserve unset", in: { missionBasis: "marketing" }, unset: ["reserveMinutes"], minutes: 0 },
];
for (const c of cases) {
  const p = resolveInputs(c.in);
  if (c.vScale) p.vCruise *= c.vScale;
  for (const k of c.unset ?? []) delete p[k];
  let R = null;
  try { R = runSizing(engineInputs(p)); } catch (e) { check(`${c.label}: sizes`, false, e.message); continue; }
  const got = R?.missionRange;
  check(`${c.label}: the engine flies the mission range asked for`,
        Number.isFinite(got) && Math.abs(got - p.range) <= 0.1,
        `asked ${p.range} km, engine ${got} km`);
  if (c.minutes !== undefined)
    check(`${c.label}: the engine flies the reserve asked for`,
          Math.abs(R.reserveMinutesUsed - c.minutes) <= 0.01,
          `asked ${c.minutes} min, engine ${R.reserveMinutesUsed} min`);
}

/* ── 3. nobody else builds the total ────────────────────────────────── */
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const full = join(d, f);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|jsx|mjs)$/.test(f)) files.push(full);
  }
};
walk(join(ROOT, "src"));
walk(join(ROOT, "validation"));
const SELF = "validation/total-range.mjs";
const orDefault = [], builders = [];
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  if (rel === SELF) continue;
  readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (/reserveMinutes\s*\|\|/.test(line)) orDefault.push(`${rel}:${i + 1}`);
    /* The harnesses are scripts that pin their own missions; only the app's
       sources must route through engineInputs(). */
    if (rel.startsWith("src/") && rel !== "src/lib/designfile.js" && rel !== "src/engine.js"
        && (/\brange\s*[:=][^;]*\+[^;]*(reserve|Vres|rDkm)/i.test(line)
            || /\brange\s*[:=]\s*[\w.]*\brange\s*\+/.test(line)))
      builders.push(`${rel}:${i + 1}`);
  });
}
check("no source defaults reserveMinutes with || (0 is a real reserve)",
      orDefault.length === 0, orDefault.join(", "));
check("only engineInputs() adds the reserve distance to the range",
      builders.length === 0, builders.join(", "));

console.log("");
console.log(fail ? `TOTAL-RANGE GATE FAILED: ${fail} check(s)` : `TOTAL-RANGE GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
