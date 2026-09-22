/* =====================================================================
   RENDER FREEZE GATE
   =====================================================================
   WHY THIS EXISTS, STATED PLAINLY

   Every geometry defect this project has ever had was found by a HUMAN
   LOOKING AT THE SCREEN, weeks after it shipped, and never by the twelve
   automated harnesses. Floating wingtip pylons. A V-tail below the
   fuselage. Rotor counts that did not match the configuration. A 1.45 m
   mast on an 8.3 m rotor. A V-tail drawn at half its size. A tilting
   nacelle that never tilted. Rotor discs passing through the surfaces
   carrying them.

   The harnesses are excellent at arithmetic and structurally blind to
   "does this look like an aeroplane". They test properties somebody
   thought to name. A render diff tests EVERYTHING AT ONCE, including the
   things nobody has thought of yet, which is exactly the class of defect
   that has been getting through.

   So: every configuration is rendered to PNG, byte-for-byte, and the
   images are committed. If a change alters what the tool draws, this
   fails and names the layout.

   WHAT IS COVERED. The six eVTOL aircraft configurations in two views
   each, the coaxial multicopter variant, and — since the drone engine
   grew a 3D airframe view that this gate did not watch at all — six
   DRONE layouts: a planar quad from two angles, a hexa, both coaxial
   stackings (OCTAQUAD and DODECAHEXA, where two motors share an arm),
   and a quad with a rotor failed. The drone views render through the
   same primitive list the panel draws from, src/classes/drone/scene3d.js,
   so this gate guards the drawing rather than a second renderer's
   imitation of it. Measured sensitivity: a 0.1 % change in the arm-length
   formula moves all six drone hashes and none of the aircraft ones. It does not know whether the change is an
   improvement - that judgement needs eyes - but it guarantees the change
   is SEEN, at the commit that causes it, instead of being discovered
   later by a user.

   The render is deterministic: no randomness, no clock, fixed camera,
   fixed size. Verified by rendering twice and comparing hashes.

   WHEN THIS FAILS: open the new render, LOOK AT IT, and decide.
     - it is an improvement -> npm run render:record, and say why in the commit
     - it is a regression   -> fix it; the diff has told you where

   Run: node validation/render-freeze.mjs   (--record to re-baseline)
   ===================================================================== */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, VIEWS, CONFIGS } from "../tools/render3d.mjs";
import { renderDrone, DRONE_CONFIGS } from "../tools/render-drone.mjs";

const REF = "validation/renders";
const VIEW_SET = ["iso", "top"];        // one shape view, one planform view
const record = process.argv.includes("--record");

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const work = join(tmpdir(), "evtol-render-freeze");
mkdirSync(work, { recursive: true });
if (!existsSync(REF)) mkdirSync(REF, { recursive: true });

console.log("RENDER FREEZE GATE");
console.log("=".repeat(72));

/* Layout variants that are not the default and would otherwise never be
   looked at. The coaxial multicopter is a different aircraft from the
   coplanar one - half the arms, rotors in stacked pairs - so it gets its own
   frozen view. */
const VARIANTS = [
  { cfg: "multicopter", tag: "coaxial", extra: { rotorArrangement: "coaxial", nPropHover: 8 } },
];

const changed = [], missing = [], seen = new Set();
const jobs = [];
for (const cfg of CONFIGS) for (const v of VIEW_SET)
  jobs.push({ name: `${cfg}-${v}.png`,
              draw: (out) => { const [yaw, pitch] = VIEWS[v]; render(cfg, yaw, pitch, 1100, 740, out); } });
for (const va of VARIANTS) for (const v of VIEW_SET)
  jobs.push({ name: `${va.cfg}-${va.tag}-${v}.png`,
              draw: (out) => { const [yaw, pitch] = VIEWS[v]; render(va.cfg, yaw, pitch, 1100, 740, out, va.extra); } });

/* THE DRONE VIEWS, which this gate did not cover until now. `render3d.mjs`
   draws the eVTOL mesh and never mentions a drone, so the airframe view
   had no regression protection at all while being exactly the kind of
   drawing this gate exists for — rotor counts, azimuths, arm clearance
   and coaxial stacking are all geometry a harness will not notice going
   wrong. These render through the SAME primitive list the panel draws
   from (src/classes/drone/scene3d.js), so a geometry change reaches the
   PNG because it reaches the drawing. */
for (const cfg of DRONE_CONFIGS)
  jobs.push({ name: `drone-${cfg.key}.png`, draw: (out) => renderDrone(cfg, 720, 540, out) });

{
  for (const job of jobs) {
    const { name } = job;
    seen.add(name);
    const out = join(work, name);
    job.draw(out);
    const refPath = join(REF, name);
    if (record) { writeFileSync(refPath, readFileSync(out)); continue; }
    if (!existsSync(refPath)) { missing.push(name); continue; }
    const a = sha(refPath), b = sha(out);
    if (a !== b) changed.push(`${name}  reference ${a.slice(0, 12)}  now ${b.slice(0, 12)}`);
    else console.log(`  same  ${name}`);
  }
}

if (record) {
  /* drop baselines for views/layouts that no longer exist */
  for (const f of readdirSync(REF)) if (f.endsWith(".png") && !seen.has(f)) unlinkSync(join(REF, f));
  console.log(`\nrecorded ${seen.size} reference renders -> ${REF}`);
  process.exit(0);
}

if (missing.length) {
  console.log(`\nFAIL: ${missing.length} reference render(s) missing: ${missing.join(", ")}`);
  console.log(`      Run \`npm run render:record\` and commit the images.`);
  process.exit(1);
}
if (changed.length) {
  console.log(`\nFAIL: the tool draws ${changed.length} of ${seen.size} views differently than the committed reference`);
  for (const c of changed) console.log(`  - ${c}`);
  console.log(`\n  LOOK AT THE NEW RENDER before deciding. It is in:`);
  console.log(`    ${work}`);
  console.log(`  If the change is an improvement, \`npm run render:record\` and say why in the commit.`);
  console.log(`  If it is not, the diff has just told you which layout broke.`);
  process.exit(1);
}
console.log(`\nPASS: all ${seen.size} views render exactly as committed`);
