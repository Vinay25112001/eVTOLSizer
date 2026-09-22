/* =====================================================================
   evtol-sizer — THE PUBLIC ENGINE API
   =====================================================================
   The same engine the web app runs, callable from Node (and from any
   language through the `evtol-size` command). Documented in docs/API.md.

   Under the project's versioning rule (CHANGELOG.md), what is exported
   HERE, the design-file format and the registered output names are the
   public interface. Anything imported from a deeper path is internal and
   may change in any release.

   Every call returns the warnings and domain placard with the numbers, so
   a script cannot take a result without also receiving what is known to
   be wrong with it (NASA-STD-7009B [M&S 32]).
   ===================================================================== */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runSizing } from "./engine.js";
import { CONFIGURATIONS, CONFIG_DEFAULTS } from "./engine/configuration.js";
import { DEFAULT_PARAMS } from "./lib/defaults.js";
import {
  engineInputs, resolveInputs, makeDesignRecord, readDesignRecord, checkContinuity,
  buildStamp, appVersionLabel, DESIGN_FORMAT, DESIGN_FORMAT_VERSION, setRuntimeStamp,
} from "./lib/designfile.js";
import { resultWarnings, uncertaintyStatement, CATEGORIES } from "./lib/warnings.js";
import { assessDomain, DOMAIN } from "./lib/domain.js";
import { INPUTS, OUTPUTS, provenanceOf } from "./lib/provenance.js";

export const API_VERSION = 1;

/* Stamp records made through the API with the package version and, when run
   from its own git checkout, the commit. An installed copy is "unknown" - and
   a copy installed INSIDE someone else's repository must not report THEIR
   commit, so git is trusted only when its top level is this package. */
{
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const dir = fileURLToPath(new URL("..", import.meta.url));
  const git = (args) => { try { return execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
  const top = git(["rev-parse", "--show-toplevel"]);
  const own = top != null && resolve(top).toLowerCase() === resolve(dir).toLowerCase();
  const commit = own ? git(["rev-parse", "--short=12", "HEAD"]) : null;
  const status = commit ? git(["status", "--porcelain", "--", "src"]) : null;
  setRuntimeStamp({ version: pkg.version, commit: commit || "unknown", dirty: status == null ? null : status.length > 0,
                    builtAt: null, mode: "node-api" });
}

/**
 * Size one design.
 * @param {object} inputs  App inputs; anything omitted takes DEFAULT_PARAMS.
 *                         `range` is the mission range EXCLUDING the reserve,
 *                         exactly as the app's slider.
 * @param {object} [opts]  { customAirfoil }
 * @returns {{ inputs, result, error, converged, warnings, warningCounts, domain }}
 */
export function size(inputs = {}, { customAirfoil = null } = {}) {
  const resolved = resolveInputs(inputs);
  let result = null, error = null;
  try { result = runSizing(engineInputs(resolved, customAirfoil)); }
  catch (e) { error = e?.message ?? String(e); }
  const w = resultWarnings({ params: resolved, R: result });
  return {
    inputs: resolved,
    result,
    error,
    converged: !!result && result.r2Diverged !== true,
    warnings: w.items,
    warningCounts: w.counts,
    domain: w.domain,
  };
}

/** Size many designs; each entry is sized independently. */
export function sizeMany(list, opts) {
  return list.map((inputs) => size(inputs, opts));
}

/** A design record (the .evtol.json format) for these inputs. */
export function designRecord(inputs = {}, { customAirfoil = null, name = "" } = {}) {
  return makeDesignRecord({ params: inputs, customAirfoil, name });
}

/** Re-run a saved design (object or JSON text) and report continuity. */
export function reopen(recordOrText) {
  const record = readDesignRecord(recordOrText);
  const check = checkContinuity(record);
  const { R, ...rest } = check;
  return { record, continuity: rest, result: R ?? null };
}

/** The engine build this API is running. */
export function engineVersion() {
  return { ...buildStamp(), label: appVersionLabel(), api: API_VERSION,
           designFormat: DESIGN_FORMAT, designFormatVersion: DESIGN_FORMAT_VERSION };
}

export {
  DEFAULT_PARAMS, CONFIGURATIONS, CONFIG_DEFAULTS,
  INPUTS, OUTPUTS, provenanceOf, uncertaintyStatement, CATEGORIES,
  assessDomain, DOMAIN, readDesignRecord, checkContinuity,
};
export const LAYOUTS = Object.keys(CONFIGURATIONS);
