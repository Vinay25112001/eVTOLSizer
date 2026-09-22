/* =====================================================================
   UNITS — one table, applied in one place
   =====================================================================
   The eVTOL studio had a SI/IMP switch and the aircraft and drone
   studios did not, because the converter was an object built inside
   App.jsx's component body and could not be imported. This is that
   decision extracted, so all three studios read one table.

   IT CONVERTS IN BOTH DIRECTIONS, which the eVTOL switch never had to.
   The aircraft studio already displays some quantities in IMPERIAL by
   choice — wing loading in lb/ft², speeds in kt, range in nm, frame
   pitch in inches — because the sources those come from are imperial.
   A switch that only went SI -> IMP would leave those untouched and the
   sheet would be half one system and half the other. So every unit
   declares which system it belongs to and is converted when the reader
   asks for the other one.

   THE CONVERSION IS APPLIED IN `Kpi`, NOT AT 97 CALL SITES. Both studios
   render their numbers through the same component, and every call passes
   the unit it is already labelling the value with. Editing 97 sites by
   hand would mean 97 chances to attach the wrong converter to a number —
   the failure this tool exists to avoid — whereas one table keyed by the
   unit string is checkable, and `validation/units.mjs` checks it.

   ANYTHING NOT IN THE TABLE IS LEFT ALONE, deliberately. An unknown unit
   passes through with its value and its label untouched, so the worst
   case is a quantity that does not convert rather than one that converts
   wrongly and is labelled as though it had. Dimensionless ratios, angles,
   electrical quantities, times and rpm are listed explicitly in
   NO_CONVERT so that "not converted" is a recorded decision rather than
   an omission nobody noticed.
   ===================================================================== */

/* system: which of the two a unit belongs to. `to`: its counterpart.
   `k`: multiply by this to reach the counterpart. Exact factors, since
   every one of these is defined rather than measured. */
export const UNIT_TABLE = Object.freeze({
  /* ── mass ── */
  "kg":      { system: "SI",  to: "lb",     k: 1 / 0.45359237 },
  "g":       { system: "SI",  to: "oz",     k: 1 / 28.349523125 },
  "lb":      { system: "IMP", to: "kg",     k: 0.45359237 },
  "oz":      { system: "IMP", to: "g",      k: 28.349523125 },
  /* ── length ── */
  "m":       { system: "SI",  to: "ft",     k: 1 / 0.3048 },
  "mm":      { system: "SI",  to: "in",     k: 1 / 25.4 },
  "km":      { system: "SI",  to: "nm",     k: 1 / 1.852 },
  "ft":      { system: "IMP", to: "m",      k: 0.3048 },
  "in":      { system: "IMP", to: "mm",     k: 25.4 },
  "nm":      { system: "IMP", to: "km",     k: 1.852 },
  /* ── area ── */
  "m²":      { system: "SI",  to: "ft²",    k: 1 / 0.09290304 },
  "ft²":     { system: "IMP", to: "m²",     k: 0.09290304 },
  /* ── speed ── */
  "m/s":     { system: "SI",  to: "kt",     k: 3600 / 1852 },
  "kt":      { system: "IMP", to: "m/s",    k: 1852 / 3600 },
  "kt EAS":  { system: "IMP", to: "m/s EAS", k: 1852 / 3600 },
  "m/s EAS": { system: "SI",  to: "kt EAS",  k: 3600 / 1852 },
  /* ── force, pressure, power, energy ── */
  "N":       { system: "SI",  to: "lbf",    k: 1 / 4.4482216152605 },
  "kN":      { system: "SI",  to: "lbf",    k: 1000 / 4.4482216152605 },
  "N·m":     { system: "SI",  to: "lbf·ft", k: 1 / (4.4482216152605 * 0.3048) },
  "kN·m":    { system: "SI",  to: "lbf·ft", k: 1000 / (4.4482216152605 * 0.3048) },
  "MN·m":    { system: "SI",  to: "lbf·ft", k: 1e6 / (4.4482216152605 * 0.3048) },
  "N/m²":    { system: "SI",  to: "lb/ft²", k: 0.09290304 / 4.4482216152605 },
  "MPa":     { system: "SI",  to: "ksi",    k: 1 / 6.894757293168361 },
  "kW":      { system: "SI",  to: "hp",     k: 1000 / 745.6998715822702 },
  "W":       { system: "SI",  to: "hp",     k: 1 / 745.6998715822702 },
  "lbf":     { system: "IMP", to: "N",      k: 4.4482216152605 },
  "lbf·ft":  { system: "IMP", to: "N·m",    k: 4.4482216152605 * 0.3048 },
  "lb/ft²":  { system: "IMP", to: "N/m²",   k: 4.4482216152605 / 0.09290304 },
  "ksi":     { system: "IMP", to: "MPa",    k: 6.894757293168361 },
  "hp":      { system: "IMP", to: "kW",     k: 745.6998715822702 / 1000 },
  /* ── specific energy ── */
  "Wh/kg":   { system: "SI",  to: "Wh/lb",  k: 0.45359237 },
  "Wh/lb":   { system: "IMP", to: "Wh/kg",  k: 1 / 0.45359237 },
});

/* Not converted, and each for a reason. Listed rather than left out so a
   reader can tell a deliberate decision from an oversight. */
export const NO_CONVERT = Object.freeze({
  "": "no unit",
  "%": "a ratio is the same number in any system",
  "% MAC": "a position expressed as a fraction of the mean aerodynamic chord",
  "fraction": "dimensionless",
  "t/c": "thickness-to-chord, dimensionless",
  "M_dd": "a Mach number, dimensionless",
  "M": "Mach, dimensionless",
  "°": "an angle; degrees are used in both systems",
  "deg": "an angle",
  "min": "time is not a system-dependent unit here",
  "s": "time",
  "ms": "time",
  "h": "time",
  "rpm": "revolutions per minute is used in both systems",
  "rpm/V": "motor velocity constant, quoted this way by every vendor",
  "Nm/A": "torque constant, quoted this way by every vendor",
  "A": "electrical",
  "V": "electrical",
  "Ah": "electrical charge",
  "Wh": "energy; the imperial alternative (BTU) is not used in this field",
  "mΩ": "electrical resistance",
  "Ω": "electrical resistance",
  "dBm": "logarithmic power, dimensionless ratio to 1 mW",
  "dBi": "antenna gain, a ratio",
  "MHz": "frequency",
  "mW": "electrical",
  /* NOT CONVERTED, AND THE REASON IS AN AMBIGUITY RATHER THAN A CHOICE.
     "lb/ft²" is used in this field for BOTH wing loading as a force per
     area (the counterpart of N/m², already in the table) and as a mass
     per area (the counterpart of kg/m²). The two differ by g, so a
     single "lb/ft²" key cannot mean both: converting kg/m² into it
     would make the round-trip come back a factor of 9.807 out, which is
     the gate telling the truth about the unit string rather than about
     the arithmetic. Left in SI, visibly, instead of being silently
     converted into a label that could be read as either quantity. */
  "kg/m²": "ambiguous in imperial: lb/ft² is used for both force/area and mass/area, which differ by g",
});

export const SYSTEMS = Object.freeze(["SI", "IMP"]);

/* How many decimals a formatted string is carrying, so the converted
   number is shown to the same precision rather than to whatever
   toFixed's default happens to be. */
function decimalsOf(text) {
  const m = /\.(\d+)/.exec(text);
  return m ? m[1].length : 0;
}

/* Convert an ALREADY FORMATTED display string.

   Returns the original untouched whenever anything is uncertain: an
   unknown unit, a value that is not a number ("—", "n/a"), or a unit
   already in the requested system. A value that does not convert is a
   small annoyance; a value converted with the wrong factor and labelled
   as though it were right is the thing this must never do. */
export function convertDisplay(value, unit, system = "SI") {
  /* " kg" and "kg" are the same unit. One call site pads its label for
     spacing, and a lookup on the raw string silently declined to convert
     it — found by the gate, which is the only reason it was ever noticed.
     The padding is preserved on the way out so the layout is unchanged. */
  const key = String(unit ?? "").trim();
  const padL = String(unit ?? "").match(/^\s*/)[0];
  const padR = String(unit ?? "").match(/\s*$/)[0];
  const spec = UNIT_TABLE[key];
  if (!spec || spec.system === system) return { value, unit };

  const text = String(value);
  const cleaned = text.replace(/[\s, ]/g, "");
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return { value, unit };   // not a plain number

  const n = Number(cleaned) * spec.k;
  if (!Number.isFinite(n)) return { value, unit };

  const dp = decimalsOf(text);
  /* Keep a thousands separator if the original had one — dropping it
     would make a converted mass harder to read than the one it replaced. */
  const grouped = /[, ]/.test(text);
  const out = n.toFixed(dp);
  return { value: grouped ? Number(out).toLocaleString("en-US", {
    minimumFractionDigits: dp, maximumFractionDigits: dp }) : out, unit: padL + spec.to + padR };
}

/* Every unit this build displays, for the gate to check against. */
export function isKnownUnit(unit) {
  const key = String(unit ?? "").trim();
  return key in UNIT_TABLE || key in NO_CONVERT;
}

/* Convert a string that already carries its unit — "78,797 kg", "2,960 nm".

   The studios' header strips build value and label into one string
   rather than passing them to `Kpi` separately, and those are the most
   prominent numbers on the page: a toggle that left them alone would
   show a sheet reading "78,797 kg" beside "173,718 lb". Rather than
   restructure those call sites, the unit is recovered from the end of
   the string.

   Longest match first, so "kt EAS" is not mistaken for "kt" and "m/s"
   is not mistaken for "s". A string whose tail matches nothing known is
   returned untouched, the same safe failure as everywhere else. */
const UNITS_BY_LENGTH = Object.keys(UNIT_TABLE).sort((a, b) => b.length - a.length);

export function convertLabelled(text, system = "SI") {
  const s = String(text ?? "");
  for (const u of UNITS_BY_LENGTH) {
    if (!s.endsWith(u)) continue;
    const head = s.slice(0, s.length - u.length);
    /* The character before the unit must not be a letter, or "in" would
       match the end of "Robin" and "m" the end of "trim". */
    if (/[A-Za-z0-9]$/.test(head.trimEnd()) && !/\s$/.test(head)) continue;
    const { value, unit } = convertDisplay(head.trim(), u, system);
    if (unit === u && value === head.trim()) return s;          // nothing changed
    return `${value} ${unit}`;
  }
  return s;
}
