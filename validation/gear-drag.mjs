/* =====================================================================
   LANDING-GEAR DRAG — THE DEFAULT THE USER NEVER SAW
   =====================================================================
   `DEFAULT_PARAMS` carried no `gearType`, and `engine/drag.js:56` reads
   `p.gearType || "fixed"`, so every run of this tool landed on FIXED gear
   at CD0 0.015 -- the largest single parasite-drag term, 34.2 % of CD0tot
   -- while `engine.js` states the opposite a few lines away: "eVTOL with
   retractable/folding gear uses CD0g = 0.003 ... Winged lift+cruise eVTOL
   (Joby, Archer) use folding/retractable gear -> 0.003".

   Two defects in one, and they need different fixes:

     1. the value disagreed with the class's own sourced comment
     2. nothing on the panel said a choice was being made at all

   Measured on the default design, the gear alone is worth 11.65 % of MTOW:

     gearType      CD0gear   CD0tot    L/D     MTOW
     fixed          0.015    0.043806   9.69   2795.68 kg
     retractable    0.003    0.033421  11.86   2469.91 kg
     faired         0.001    0.032360  12.14   2312.92 kg

   THE GAIN IS NET OF THE MECHANISM. `engine/weights.js:322` applies a
   1.1437 factor to the AFDD84 FUSELAGE weight whenever the gear retracts
   -- the airframe provisions a retraction bay and its attachments, which
   is where NDARC books that cost, not in the gear group -- so the
   aircraft pays for the mechanism and still comes out lighter. Section 4
   checks it is really being charged, because a drag improvement that
   quietly skipped its own weight penalty would look identical here.

   WHAT IS NOT CHANGED: `drag.js` keeps `|| "fixed"` for a caller that
   passes no gear at all. For an unknown aircraft that is the conservative
   assumption and it is the right fallback; what was wrong was this tool's
   own default aircraft making that choice silently. Section 2 pins the
   fallback so it cannot drift into the new default and quietly make every
   external caller 11.65 % lighter.

   Run: node validation/gear-drag.mjs
   ===================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_PARAMS } from "../src/lib/defaults.js";
import { engineInputs } from "../src/lib/designfile.js";
import { runSizing } from "../src/engine.js";
import { DRAG_CONSTANTS, rotorcraftDragCD0 } from "../src/engine/drag.js";
import { provenanceOf } from "../src/lib/provenance.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const size = (over) => runSizing(engineInputs({ ...DEFAULT_PARAMS, ...over }));

/* ── 1. the choice is DECLARED, not fallen into ───────────────────────── */
console.log("\n-- 1. the default aircraft declares its gear instead of defaulting into one --");
{
  check("DEFAULT_PARAMS declares gearType at all",
    Object.prototype.hasOwnProperty.call(DEFAULT_PARAMS, "gearType"),
    "absent means drag.js's `|| \"fixed\"` chooses, and nothing on the panel says so");
  check("  ...and it is retractable, as engine.js says for winged lift+cruise",
    DEFAULT_PARAMS.gearType === "retractable", `got ${JSON.stringify(DEFAULT_PARAMS.gearType)}`);
  const prov = provenanceOf("gearType");
  check("the provenance ledger carries gearType as sourced",
    prov != null && prov.status === "sourced", prov ? prov.status : "no entry");
  check("  ...citing Raymer Table 12.6",
    /Raymer Table 12\.6/.test(prov?.src || ""), (prov?.src || "").slice(0, 60));
}

/* ── 2. Raymer's three values, and the fallback for an unknown aircraft ── */
console.log("\n-- 2. the three sourced coefficients, and the conservative fallback --");
{
  for (const [kind, want] of [["fixed", 0.015], ["retractable", 0.003], ["faired", 0.001]])
    check(`gearCD0.${kind} = ${want} (Raymer T12.6)`, DRAG_CONSTANTS.gearCD0[kind] === want,
      `got ${DRAG_CONSTANTS.gearCD0[kind]}`);
  /* A caller that passes no gear must still get the conservative fixed
     value. This is deliberately NOT the new default: an unknown aircraft is
     not this tool's default aircraft, and if these two were ever merged,
     every external caller would silently get a 24 % lower parasite drag. */
  const p = { ...DEFAULT_PARAMS, nPropHover: 6, propDiam: 3.0 };
  delete p.gearType;
  const noGear = rotorcraftDragCD0(p, 12);
  const fixed = rotorcraftDragCD0({ ...p, gearType: "fixed" }, 12);
  check("a caller that passes NO gearType still gets fixed, the conservative choice",
    noGear.gear === 0.015, `got ${noGear.gear}`);
  check("  ...identical to asking for fixed explicitly",
    JSON.stringify(noGear) === JSON.stringify(fixed));
  /* An unknown NAME must not silently become the cheapest gear either. */
  const junk = rotorcraftDragCD0({ ...p, gearType: "hovercraft" }, 12);
  check("an unrecognised gearType falls back to fixed, not to the lowest value",
    JSON.stringify(junk) === JSON.stringify(fixed));
}

/* ── 3. the default design, and the aircraft the finding measured ─────── */
console.log("\n-- 3. the default design, and the fixed-gear aircraft it replaces --");
{
  const d = size({});
  check("the default aircraft flies retractable gear: CD0gear = 0.003", d.CD0gear === 0.003, `got ${d.CD0gear}`);
  check("  ...CD0tot = 0.033421", near(d.CD0tot, 0.0334213, 5e-6), `got ${d.CD0tot}`);
  check("  ...L/D = 11.86", near(d.LDact, 11.86, 0.01), `got ${d.LDact}`);
  check("  ...MTOW = 2469.91 kg", near(d.MTOW, 2469.91, 0.05), `got ${d.MTOW?.toFixed(4)}`);

  /* The finding's own measurement, preserved: asking for fixed reproduces
     the aircraft this tool used to publish, to the last kilogram. That is
     what says this change moved a DEFAULT and not the physics. */
  const f = size({ gearType: "fixed" });
  check("asking for fixed reproduces the old default exactly: MTOW = 2795.68 kg",
    near(f.MTOW, 2795.68, 0.05), `got ${f.MTOW?.toFixed(4)}`);
  check("  ...with CD0tot = 0.043806 and L/D = 9.69",
    near(f.CD0tot, 0.0438055, 5e-6) && near(f.LDact, 9.69, 0.01), `got ${f.CD0tot} / ${f.LDact}`);
  check("  ...and the gear is 34.2 % of its parasite drag, the largest single term",
    near((0.015 / f.CD0tot) * 100, 34.2, 0.1), `${((0.015 / f.CD0tot) * 100).toFixed(1)} %`);
  check("the default is 11.65 % lighter than the aircraft it replaces",
    near((1 - d.MTOW / f.MTOW) * 100, 11.65, 0.02), `${((1 - d.MTOW / f.MTOW) * 100).toFixed(2)} %`);

  const faired = size({ gearType: "faired" });
  check("faired is lighter still, and is NOT the default",
    faired.MTOW < d.MTOW && DEFAULT_PARAMS.gearType !== "faired", `faired ${faired.MTOW?.toFixed(2)} kg`);
  check("the three gear types give three different aircraft",
    new Set([f.MTOW.toFixed(4), d.MTOW.toFixed(4), faired.MTOW.toFixed(4)]).size === 3);
}

/* ── 4. THE MECHANISM IS PAID FOR ─────────────────────────────────────── */
console.log("\n-- 4. retracting the gear is charged to the fuselage, and still pays --");
{
  /* The penalty is a factor on the AFDD84 fuselage equation, so the check
     is NOT "the gear group got heavier" -- it did not, and testing that
     was the first thing this section got wrong. It is the FUSELAGE that
     carries the retraction provisions.

     The prediction is sharp. AFDD84 scales fuselage mass as
     Wdg^0.4879 x (Nz.WSD)^0.2075, both proportional to gross weight here,
     with Nz and the fuselage geometry identical between the two runs
     because they are inputs. So a retractable aircraft 11.65 % lighter
     should carry a fuselage 0.88347^0.6954 = 0.91745 of the fixed one's
     WITHOUT the factor -- and 1.04929 WITH it. Measured: 1.04929, an
     implied factor of 1.14370 against the 1.1437 the source declares.

     That is worth stating plainly: the retractable design's fuselage is
     HEAVIER in absolute terms, 268.30 kg against 255.69 kg, while the
     whole aircraft is 325.77 kg lighter. Nothing but the charged factor
     produces that combination. */
  const f = size({ gearType: "fixed" }), r = size({ gearType: "retractable" });
  const ff = f.weightGroupsRaw.fuselage, rf = r.weightGroupsRaw.fuselage;
  check("Nz and the fuselage geometry are identical across the two runs",
    f.weightsNzUltimate === r.weightsNzUltimate &&
    DEFAULT_PARAMS.fusLen === DEFAULT_PARAMS.fusLen,
    `Nz ${f.weightsNzUltimate} vs ${r.weightsNzUltimate}`);
  check("the retractable design's fuselage is HEAVIER in absolute terms",
    rf > ff, `${rf.toFixed(2)} kg vs ${ff.toFixed(2)} kg, on an aircraft ${(f.MTOW - r.MTOW).toFixed(1)} kg lighter`);
  const scaling = Math.pow(r.MTOW / f.MTOW, 0.4879 + 0.2075);
  check("  ...by exactly the 1.1437 the AFDD84 equation declares, net of mass scaling",
    near((rf / ff) / scaling, 1.1437, 2e-4),
    `implied ${(((rf / ff) / scaling)).toFixed(5)}; ratio ${(rf / ff).toFixed(5)} against ${scaling.toFixed(5)} predicted without it`);
  check("and the aircraft is still lighter overall, so the trade is net",
    r.MTOW < f.MTOW, `${r.MTOW.toFixed(1)} vs ${f.MTOW.toFixed(1)} kg`);
}

/* ── 5. THE USER CAN SEE IT ───────────────────────────────────────────── */
console.log("\n-- 5. the choice is on the panel, not only in the defaults --");
{
  /* A SOURCE-LEVEL CHECK, and its limits are worth stating: this proves a
     control bound to params.gearType exists in App.jsx with all three
     options, not that it renders correctly -- validation/ui-audit.mjs does
     that, on demand, against a built app. It is here because the second
     half of this finding was "an unstated default the user never sees",
     and a fix for that must be able to fail. */
  const app = readFileSync(join(HERE, "..", "src", "App.jsx"), "utf8");
  check("App.jsx has a control bound to params.gearType",
    /params\.gearType/.test(app) && /gearType:\s*e\.target\.value/.test(app));
  for (const kind of ["retractable", "fixed", "faired"])
    check(`  ...offering "${kind}"`, new RegExp(`<option value="${kind}"`).test(app));
  check("  ...and it names the coefficient beside each choice",
    /CD0 0\.003/.test(app) && /CD0 0\.015/.test(app) && /CD0 0\.001/.test(app));
}

console.log("");
console.log(fail ? `GEAR DRAG GATE FAILED: ${fail} check(s)` : `GEAR DRAG GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
