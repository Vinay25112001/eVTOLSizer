# Engine API

The sizing engine behind the web app can be called from Node.js, and from any
language through the `evtol-size` command. It is the same code the app runs:
the same defaults, the same reserve handling, the same warnings.

Status: **API version 1, package 0.x.** Under the project's versioning rule
(see [CHANGELOG.md](../CHANGELOG.md)) the names exported from the package
root, the design-file format and the registered output names are the public
interface. Anything imported from a deeper path (`src/engine/...`) is
internal. While the version is 0.y.z, results may change between releases;
each release lists the changes that moved them.

## Install

The package is not on the npm registry. Install it from a clone or from the
repository:

```bash
git clone https://github.com/Vinay25112001/eVTOLSizer.git
cd eVTOLSizer && npm install
node bin/evtol-size.mjs --version
```

or, inside another Node project, `npm install <path-or-git-url-of-this-repo>`,
after which `import ... from "evtol-sizer"` and `npx evtol-size` work.
Node.js 20 or later is required.

## Node

```js
import { size, sizeMany, designRecord, reopen, engineVersion, DEFAULT_PARAMS } from "evtol-sizer";

const r = size({ configType: "tiltrotor", payload: 450, range: 120, vCruise: 70 });
// powertrain: "battery" (default) or "turboelectric" — see src/engine/turboelectric.js
const t = size({ configType: "liftcruise", powertrain: "turboelectric" });
t.result.fuelMassKg;  // fuel carried; turboshaftRatedKW, generatorMassKg, ...
r.converged;          // false means: do not use the numbers
r.result.MTOW;        // kg — every engine output is on r.result
r.warnings;           // NASA-STD-7009B [M&S 32] items: { cat, severity, text, impact }
r.domain;             // inside/outside the validated and verified domains, with extents
```

### Exports

| Name | What it is |
|---|---|
| `size(inputs, { customAirfoil })` | Size one design. `inputs` are the app's inputs; anything omitted takes `DEFAULT_PARAMS`. `range` is the mission range **excluding** the reserve, as on the app's slider. Returns `{ inputs, result, error, converged, warnings, warningCounts, domain }`. |
| `sizeMany(list, opts)` | `size` over an array. |
| `designRecord(inputs, { customAirfoil, name })` | A design record in the `.evtol.json` format, with the engine stamp and the result fingerprint. |
| `reopen(recordOrText)` | Re-run a saved design; returns `{ record, continuity, result }`. `continuity.status` is `identical`, `changed` or `unchecked`. |
| `engineVersion()` | Package version, commit (when run from this repository's own checkout), API and design-format versions. |
| `readDesignRecord`, `checkContinuity` | The lower-level design-file functions the two above use. |
| `DEFAULT_PARAMS` | The app's defaults. |
| `CONFIGURATIONS`, `CONFIG_DEFAULTS`, `LAYOUTS` | The six layouts and their default inputs. |
| `INPUTS`, `OUTPUTS`, `provenanceOf(key)` | The provenance registry: each input's and output's status (validated, sourced, calibrated, derived, unverified) and source. |
| `uncertaintyStatement(key, { params })` | The [M&S 33] uncertainty statement for an output, and how it was obtained. |
| `assessDomain(inputs, result)`, `DOMAIN` | The validation and verification domains and a design's position against them. |
| `CATEGORIES` | The eight [M&S 32] warning categories, a–h. |
| `API_VERSION` | `1`. |

## Command line

```bash
evtol-size inputs.json                 # summary
evtol-size inputs.json --json          # full result, one JSON object
evtol-size cases.json --json           # cases.json is an ARRAY: one JSON line per case
evtol-size design.evtol.json --reopen  # re-run a saved design file
echo '{"payload":300}' | evtol-size -  # inputs on stdin
evtol-size --version
```

Exit status: **0** when every design converged with no error-severity
warning, **1** otherwise, **2** on a usage or file error.

## Python

```python
import json, subprocess

cases = [{"configType": "multicopter", "payload": p, "range": 35} for p in (150, 200, 250)]
run = subprocess.run(["npx", "evtol-size", "-", "--json"],
                     input=json.dumps(cases), capture_output=True, text=True)
for line in run.stdout.splitlines():
    r = json.loads(line)
    print(r["inputs"]["payload"], r["converged"], r["result"]["MTOW"],
          "outside validated envelope" if not r["domain"]["insideValidation"] else "")
```

Each line carries the warnings. A script that keeps only `result` has thrown
away what the tool knows to be wrong with it.

## Reproducibility

Results are deterministic for a given engine version and platform. The
ECMAScript standard leaves `Math.exp`, `Math.pow` and the trigonometric
functions "implementation-approximated", so two JavaScript engines can differ
in the last bits; the design file and the regression gate therefore compare at
a relative tolerance of 1e-6, never bit for bit. Record `engineVersion()` with
any result you publish.
