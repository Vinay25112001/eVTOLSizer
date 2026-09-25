/* =====================================================================
   AIRCRAFT-CLASS GATE — new classes may be added; eVTOL may not move
   =====================================================================
   The app is gaining aircraft classes (trainer, transport) with their own
   inputs and sizing loops. The eVTOL sizer is the validated product, so the
   rules that keep it untouched are checked here, every run:

   1. The registry's eVTOL entry IS the engine: size === runSizing,
      defaults === DEFAULT_PARAMS, prepare === engineInputs. (The golden
      master is also run through the registry: golden-master.mjs
      --via-registry.)
   2. DEFAULT_PARAMS is pinned by content hash. Changing an eVTOL default is
      a deliberate act: update PINNED_DEFAULTS_HASH in the same commit and say
      why.
   3. sizeDesign() on the app default equals the app's own call, value by
      value.
   4. An unknown class is an error, never eVTOL by default.
   5. Dependency direction: the eVTOL engine never imports class code.
   6. Only the registry decides what a class means: no other source file
      compares `aircraftClass` to a string.
   7. Change fence: on a branch, the eVTOL engine files and defaults are
      byte-identical to master unless the commit says otherwise.
   ===================================================================== */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { runSizing } from "../src/engine.js";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import { engineInputs, hashText, canonicalJSON } from "../src/lib/designfile.js";
import { fingerprint } from "../src/lib/fingerprint.js";
import { AIRCRAFT_CLASSES, CLASS_IDS, DEFAULT_CLASS, classOf, sizeDesign, classFromSearch } from "../src/classes/registry.js";

/* 0c8b69e4b4ddec -> 062924df5fdaa0 on adding `nSeats: null`.
   WHY, AND WHY IT SIZES NOTHING. SC-VTOL-02 VTOL.2005(a) applies only to a
   passenger seating configuration of 9 or fewer and FAA AC 21.17-4
   PL.2000(a) to six or fewer, so a seat count decides WHICH DOCUMENT
   governs a design. It is not derivable from payload — an occupant and a
   sack of cargo are the same kilogrammes to this engine — so the
   Regulatory tab could not decide that gate at all, and used to render
   the MCTOM limit as an ordinary PASS/FAIL row instead. See
   validation/reg-applicability.mjs.

   The value is null, not a number, and that is the whole reason this is
   a hash change and not a re-record. engine.js passes
   `nOccupants: p.nOccupants ?? p.nSeats` to cabinAdequacy(), which falls
   back to occupantsFromPayload() for anything that is not a positive
   finite number. null takes that fallback, so every existing design keeps
   the fractional occupancy it had. Verified, not assumed: golden-master
   is byte-identical across all 277 cases, and reg-applicability.mjs
   check 7 asserts that null and absent size to the same kilogram. */
/* MOVED AGAIN FOR `vno`, AND FOR THE SAME REASON, WITH THE SAME PROOF.
   VTOL.2000(d) admits only aircraft with VNO at most 250 KCAS, and MOC-1
   SC-VTOL (c) says VNO "should be defined by the applicant" — no equation
   in the corpus yields one, so it is declared, not derived. It defaults to
   null, nothing downstream reads it except the applicability gate, and
   reg-applicability.mjs section 2b asserts that runSizing with and without
   a declared VNO is identical character for character. The hash moved
   because a key was added; no sized result did. */
/* MOVED FOR THE C-RATE DERATE, AND THIS TIME THE SIZED RESULTS DID MOVE —
   which is the one case the previous two notes did not cover, so it is
   recorded differently. `cRateDerate:0.08` was REMOVED from DEFAULT_PARAMS and
   `peukertK:1.05` added. The removal is the substantive half: the derate is now
   COMPUTED from the C-rate each design demands (Peukert, [SRC] NDARC
   TP-2015-218751 ch.26:10652), and any value left in DEFAULT_PARAMS would have
   overridden that sourced model on every single run.
   Every MTOW changed as a result — between -1.3% and -17.3% depending on
   layout, because the flat 8% was too pessimistic at every rate the fleet
   demands. golden-master was re-recorded deliberately, not to make a failure
   go away. See validation/peukert-derate.mjs, which gates the replacement. */
/* MOVED AGAIN, for two constants that were previously INVISIBLE. `vtTaper`
   (0.40) and `vtRuddervatorChordFrac` (0.30) were hardcoded inside
   engine.js and registered nowhere, so nothing could see or sweep them --
   which is precisely why the V-tail planform outputs were `unverified` while
   the wing running the identical trapezoid algebra was `derived`. Registering
   them changes the hash without changing any shipped VALUE: both keep the
   number they already had. The third of that trio, the section thickness, is
   NOT here because it stopped being a constant at all -- it is computed from
   the wing's t/c per Scholz ch.9 (engine/control-surfaces.js). Sized results
   DID move, but only through the drag of the V-tail component build-up and
   the corrected deflections; MTOW is unchanged, because that build-up turns
   out not to reach the drag total at all (see the note at the tail wetted
   areas). */
/* MOVED FOR THE OSWALD FACTOR, and by a REMOVAL again. `eOsw:0.85` left
   DEFAULT_PARAMS because the span efficiency is now COMPUTED from the
   planform (Howe 2000 eq.6.14a via Scholz ch.13; see engine/wing.js), and any
   value left here would have overridden that on every run exactly as it did
   before -- the same trap `cRateDerate` set. It survives as an explicit
   override, reported through eOswOverridden. Sized results moved: the
   computed 0.828 costs slightly more induced drag than the assumed 0.85, and
   the tail drag coupling in the same change moves them further. */
const PINNED_DEFAULTS_HASH = "159dfff349a567";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

console.log("AIRCRAFT-CLASS GATE");
console.log("=".repeat(72));

/* ── 1. the eVTOL entry is the engine ───────────────────────────────── */
const ev = AIRCRAFT_CLASSES.evtol;
check("the default class is eVTOL", DEFAULT_CLASS === "evtol");
check("eVTOL sizes with the engine itself", ev?.size === runSizing);
check("eVTOL defaults are DEFAULT_PARAMS itself", ev?.defaults === DEFAULT_PARAMS);
check("eVTOL prepares inputs with engineInputs itself", ev?.prepare === engineInputs);
check("the registry and every entry are frozen",
      Object.isFrozen(AIRCRAFT_CLASSES) && CLASS_IDS.every(id => Object.isFrozen(AIRCRAFT_CLASSES[id])));
for (const id of CLASS_IDS) {
  const c = AIRCRAFT_CLASSES[id];
  check(`class "${id}" is complete`,
        c.id === id && typeof c.label === "string" && typeof c.description === "string"
        && c.defaults && typeof c.prepare === "function" && typeof c.size === "function");
}

/* ── 2. eVTOL defaults pinned ───────────────────────────────────────── */
const h = hashText(canonicalJSON(DEFAULT_PARAMS));
check("eVTOL DEFAULT_PARAMS unchanged (content hash)", h === PINNED_DEFAULTS_HASH,
      `now ${h}, pinned ${PINNED_DEFAULTS_HASH}`);

/* ── 3. dispatch gives the app's own answer ─────────────────────────── */
{
  const a = fingerprint(runSizing(engineInputs(DEFAULT_PARAMS)));
  const b = fingerprint(sizeDesign({ aircraftClass: "evtol", params: DEFAULT_PARAMS }));
  const c = fingerprint(sizeDesign({ params: DEFAULT_PARAMS }));
  const keys = new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)]);
  const bad = [...keys].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])
                                 || JSON.stringify(a[k]) !== JSON.stringify(c[k]));
  check("sizeDesign(eVTOL) equals the app's own call in every output", bad.length === 0 && keys.size > 100,
        bad.length ? bad.slice(0, 5).join(", ") : `${keys.size} outputs`);
}

/* ── 4. unknown classes refuse ──────────────────────────────────────── */
for (const id of ["glider", "", "toString", "__proto__", "EVTOL"]) {
  let threw = false;
  try { classOf(id); } catch { threw = true; }
  check(`an unknown class ("${id}") is refused`, threw);
}
{
  let threw = false;
  try { sizeDesign({ aircraftClass: "airship", params: {} }); } catch { threw = true; }
  check("sizeDesign refuses an unknown class instead of sizing an eVTOL", threw);
}

/* ── 4b. page addresses ─────────────────────────────────────────────── */
check("an address with no ?class= opens the eVTOL sizer (every existing link)",
      classFromSearch("") === "evtol" && classFromSearch("?tab=3&theme=dark") === "evtol" && classFromSearch("?class=") === "evtol");
check("?class=trainer opens the trainer", classFromSearch("?class=trainer") === "trainer");
check("an unknown ?class= is passed through to the error page, not turned into eVTOL",
      classFromSearch("?class=glider") === "glider");
{
  /* Dual engine: the address picks the design mode (route.js), and Root
     shows the eVTOL sizer untouched in eVTOL mode. */
  const main = readFileSync(join(ROOT, "src/main.jsx"), "utf8");
  const root = readFileSync(join(ROOT, "src/classes/Root.jsx"), "utf8");
  check("the entry point mounts the class root, which renders <App /> unchanged in eVTOL mode",
        /<Root\s*\/>/.test(main) && /<App \/>/.test(root) && !/<App\s+[^/]/.test(root)
        && /display: mode === "evtol" \? "contents" : "none"/.test(root));
  const R = await import("../src/classes/route.js");
  check("an address with no mode opens eVTOL; ?mode=aircraft opens the aircraft studio",
        R.routeFromSearch("").mode === "evtol" && R.routeFromSearch("?tab=3").mode === "evtol"
        && R.routeFromSearch("?mode=aircraft&type=bizjet").type === "bizjet"
        && R.routeFromSearch("?mode=aircraft&type=nonsense").type === R.DEFAULT_STUDIO_TYPE);
  check("older ?class= links open the studio on that type; an unknown class is an error, not eVTOL",
        ["trainer", "transport", "turboprop", "bizjet"].every((t) => R.routeFromSearch(`?class=${t}`).type === t)
        && R.routeFromSearch("?class=glider").unknown === "glider");
  const app = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  check("the eVTOL sizer reaches the aircraft engine only through the mode switch",
        (() => { const imps = app.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l) && /classes\//.test(l));
                 return imps.length === 1 && /aircraft\/DesignModeSwitch\.jsx/.test(imps[0]); })());
}

/* ── 5 & 6. source scans ────────────────────────────────────────────── */
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const full = join(d, f);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|jsx|mjs)$/.test(f)) files.push(full);
  }
};
walk(join(ROOT, "src"));
const EVTOL_CORE = (rel) => rel === "src/engine.js" || rel.startsWith("src/engine/")
                          || rel === "src/lib/defaults.js";
const importsClasses = [], branches = [];
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  const text = readFileSync(f, "utf8");
  /* `import x from "…"`, bare `import "…"`, and dynamic `import("…")`. */
  if (EVTOL_CORE(rel) && /(?:\bfrom|\bimport)\s*\(?\s*["'`][^"'`]*\/classes\//.test(text)) importsClasses.push(rel);
  if (!rel.startsWith("src/classes/")) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (/aircraftClass\s*[!=]==?\s*["'`]|["'`]\s*[!=]==?\s*[\w.]*aircraftClass\b/.test(line))
        branches.push(`${rel}:${i + 1}`);
    });
  }
}
check("the eVTOL engine imports no class code", importsClasses.length === 0, importsClasses.join(", "));
check("only src/classes/ compares aircraftClass to a name", branches.length === 0, branches.join(", "));

/* ── 7. change fence ────────────────────────────────────────────────── */
{
  const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout?.trim();
  const base = git("merge-base", "HEAD", "master");
  if (!branch || base.status !== 0) {
    console.log("  SKIP  change fence — no git history or no master branch here");
  } else if (branch === "master") {
    console.log("  SKIP  change fence — on master (the fence guards branches before they merge)");
  } else {
    const diff = git("diff", "--name-only", base.stdout.trim(), "--",
                     "src/engine.js", "src/engine", "src/lib/defaults.js",
                     "validation/golden-master.snapshot.json");
    const moved = (diff.stdout || "").split(/\r?\n/).filter(Boolean);
    check(`on "${branch}": eVTOL engine, defaults and golden snapshot unchanged since master`,
          diff.status === 0 && moved.length === 0, moved.join(", "));
  }
}

console.log("");
console.log(fail ? `AIRCRAFT-CLASS GATE FAILED: ${fail} check(s)` : `AIRCRAFT-CLASS GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
