/* =====================================================================
   AUTOPILOT FILE FORMATS — written once, used by both exporters
   =====================================================================
   The drone half emits Copter parameters; the aircraft half emits
   QuadPlane and PX4 VTOL parameters. The PARAMETERS differ completely.
   The FILE FORMATS do not, and there is no reason for two copies of a
   comma-delimiter and a tab-delimiter to drift apart.

   THE TWO FORMATS ARE NOT INTERCHANGEABLE, which is the thing worth
   getting right in one place:

     ArduPilot .param    NAME,VALUE            comma, two columns, no type
     QGroundControl .params
                         id<TAB>id<TAB>NAME<TAB>VALUE<TAB>TYPE
                                               tab, five columns, typed

   The .param form is de facto — ArduPilot publishes no prose spec for it
   and it is established from the files ArduPilot itself ships in
   Tools/Frame_params. The .params form is specified by QGroundControl's
   developer guide. Whether Mission Planner accepts a tab-delimited file,
   or QGC a comma-delimited one, is undocumented, so nothing here assumes
   either.

   A REFUSAL IS PART OF THE FILE. Both writers put the parameters a tool
   decided NOT to emit, and the reason, in the header as comments. That is
   the half a user cannot get anywhere else: any tool can write
   FRAME_CLASS,1, and only one that has read the documentation knows what
   to leave alone. */

/* MAV_PARAM_TYPE, from the MAVLink common message set. Only the two the
   autopilots use for these parameters. NOTE: QGC's own worked example
   shows a float parameter typed 4 (INT16), which cannot be right; this
   follows the declared C type in the parameter reference instead. */
export const MAV_PARAM_TYPE = Object.freeze({ INT32: 6, REAL32: 9 });

/* ArduPilot's shipped files print plain decimals — no exponent, no
   trailing-zero noise. 0.65 stays 0.65; 12.600000000000001 becomes 12.6. */
export function formatValue(x, maxDecimals = 6) {
  if (!Number.isFinite(x)) throw new Error(`refusing to emit a non-finite parameter value: ${x}`);
  if (Number.isInteger(x)) return String(x);
  const s = x.toFixed(maxDecimals).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

export function wrapComment(text, width = 96) {
  const words = String(text).split(/\s+/);
  const out = [];
  let line = "#";
  for (const w of words) {
    if (line.length + 1 + w.length > width) { out.push(line); line = "#"; }
    line += " " + w;
  }
  if (line !== "#") out.push(line);
  return out;
}

function refusalBlock(refusals) {
  if (!refusals?.length) return [];
  const L = ["#", "# NOT EMITTED, and why:"];
  for (const r of refusals) L.push(...wrapComment(`${r.name}: ${r.why}`));
  return L;
}

/* ArduPilot / Mission Planner .param */
export function writeArduPilotParam({ headerNotes = [], notes = [], refusals = [], params }) {
  const L = [];
  for (const h of headerNotes) L.push(`#NOTE: ${h}`);
  L.push("#");
  L.push("#NOTE: Mission Planner does not apply this file automatically. Load from File, review the "
       + "diff, then Write Params.");
  L.push("#");
  for (const n of notes) L.push(...wrapComment(n));
  L.push(...refusalBlock(refusals));
  L.push("#");
  for (const q of params) L.push(`${q.name},${formatValue(q.value)}`);
  return L.join("\n") + "\n";
}

/* QGroundControl .params */
export function writeQgcParams({ headerNotes = [], notes = [], refusals = [], params },
                               vehicleId = 1, componentId = 1) {
  const L = [];
  L.push(`# Onboard parameters for Vehicle ${vehicleId}`);
  L.push("#");
  for (const h of headerNotes) L.push(...wrapComment(h));
  for (const n of notes) L.push(...wrapComment(n));
  L.push(...refusalBlock(refusals));
  L.push("#");
  L.push("# # Vehicle-Id Component-Id Name Value Type");
  for (const q of params)
    L.push([vehicleId, componentId, q.name, formatValue(q.value), q.type].join("\t"));
  return L.join("\n") + "\n";
}

/* Every parameter name must fit MAVLink's param_id field. A longer name
   is silently truncated on the wire, which would set a DIFFERENT
   parameter — so it is refused here instead. */
export const MAX_PARAM_NAME = 16;
export function checkNames(params) {
  const bad = params.filter((p) => p.name.length > MAX_PARAM_NAME);
  if (bad.length)
    throw new Error(`parameter name(s) exceed MAVLink's ${MAX_PARAM_NAME}-character param_id limit: `
      + bad.map((b) => b.name).join(", "));
  return true;
}
