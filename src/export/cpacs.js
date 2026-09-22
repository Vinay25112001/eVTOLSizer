/* =====================================================================
   CPACS EXPORT — a sized design as CPACS 3.5.1 (DLR, Apache-2.0)
   =====================================================================
   CPACS is the open data format aircraft-design organisations exchange
   designs in; it has a rotorcraft branch. This writes what a conceptual
   sizing tool actually knows — the mass statement, the reference values and
   the global figures — and nothing it does not. No geometry is written: the
   tool's geometry export is OpenVSP, and a CPACS fuselage or rotor-blade
   definition from a parametric sizing run would be invented detail.

   CHOICES THE SCHEMA FORCES, STATED:
     designMasses needs mTOM, mZFM, mMLM and mMRM. A battery aircraft burns
       no fuel, so its zero-fuel mass is its take-off mass, and it lands and
       taxis at that mass: all four are MTOW.
     fuel is 0 kg. The battery is part of the operating empty mass (it is on
       board whatever the mission), filed under propulsion as energy storage,
       following NASA's concept-vehicle weight statements.
     The weight groups follow NDARC: the rotor group is STRUCTURE.
     reference area is the wing area; a wingless layout uses total rotor disk
       area and says so in the reference's description.

   Validated against the CPACS 3.5.1 XSD by validation/cpacs-export.mjs.
   ===================================================================== */

export const CPACS_VERSION = "3.5";      // schema family written in header/cpacsVersion
export const CPACS_SCHEMA_RELEASE = "3.5.1";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (x, d = 3) => (Number.isFinite(x) ? +x.toFixed(d) : 0);

export const MASS_GROUPS = {
  mStructure: {
    label: "Structure (NDARC grouping: the rotor group is structure)",
    parts: { wing: "Wing", rotors: "Rotor group", vtail: "Empennage", fuselage: "Fuselage",
             gear: "Landing gear", booms: "Booms", nacelle: "Nacelles" },
  },
  mPropulsion: {
    label: "Propulsion, including the battery as energy storage",
    parts: { motors: "Motors", inverters: "Inverters", driveSys: "Drive system",
             cruisePropulsion: "Cruise propulsion", battery: "Battery (energy storage)" },
  },
  mSystemsAndEquipment: {
    label: "Systems and equipment",
    parts: { flightControls: "Flight controls", electrical: "Electrical", ecs: "Environmental control",
             packSystems: "Battery pack systems", avionics: "Avionics", furnishings: "Furnishings" },
  },
};

/**
 * @param {object} a
 * @param {object} a.inputs   resolved app inputs
 * @param {object} a.R        engine result
 * @param {object} a.stamp    build stamp (lib/designfile.js)
 * @param {string} a.inputHash
 * @param {{error:number,warning:number,info:number}} [a.warningCounts]
 * @param {string} [a.name]
 * @param {string} [a.timestamp]  ISO date-time (injectable for tests)
 */
export function generateCPACS({ inputs, R, stamp = {}, inputHash = "", warningCounts = null, name = "eVTOL concept", timestamp = null }) {
  if (!R) throw new Error("No sizing result to export.");
  if (R.r2Diverged) throw new Error("The sizing loop did not converge; a non-converged design is not exported.");
  const g = { ...(R.weightGroupsRaw || {}), battery: R.Wbat };
  const MTOW = R.MTOW, payload = inputs.payload, Wempty = R.Wempty, Wbat = R.Wbat;
  const OEM = Wempty + Wbat;
  const ts = (timestamp ?? new Date().toISOString()).slice(0, 19);
  const tool = `eVTOL Sizer ${stamp.version ? "v" + stamp.version : "(unversioned)"}${stamp.commit ? " (" + stamp.commit + (stamp.dirty ? ", uncommitted changes" : "") + ")" : ""}`;
  const counts = warningCounts ? ` Warnings at export: ${warningCounts.error} error(s), ${warningCounts.warning} warning(s).` : "";
  const nRot = R.nPropHover ?? inputs.nPropHover ?? 0;
  const diam = R.propDiam ?? inputs.propDiam ?? 0;
  const winged = (R.Swing ?? 0) > 0;
  const refArea = winged ? R.Swing : nRot * Math.PI * (diam / 2) ** 2;
  const refLen = winged && Number.isFinite(R.MAC) ? R.MAC : diam;

  const mass = (uID, value, label, indent) =>
    `${indent}<massDescription uID="${uID}"><name>${esc(label)}</name><mass>${num(value)}</mass></massDescription>`;

  const groups = Object.entries(MASS_GROUPS).map(([tag, grp]) => {
    const total = Object.keys(grp.parts).reduce((s, k) => s + (g[k] || 0), 0);
    const elements = Object.entries(grp.parts)
      .filter(([k]) => (g[k] || 0) > 0)
      .map(([k, label]) => `              <mElement uID="m_${tag}_${k}"><name>${esc(label)}</name><mass>${num(g[k])}</mass></mElement>`)
      .join("\n");
    return [
      `            <${tag}>`,
      mass(`${tag}_total`, total, grp.label, "              "),
      `              <mGroup>`,
      mass(`${tag}_group`, total, grp.label, "                "),
      elements ? elements.replace(/^ {14}/gm, "                ") : "",
      `              </mGroup>`,
      `            </${tag}>`,
    ].filter(Boolean).join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<cpacs xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="cpacs_schema.xsd">
  <header>
    <name>${esc(name)}</name>
    <description>${esc(`Conceptual sizing result from ${tool}. Input hash ${inputHash}.${counts} Masses in kg, lengths in m. A conceptual-design result (NPR 7150.2D Class E), not compliance data.`)}</description>
    <version>1.0.0</version>
    <cpacsVersion>${CPACS_VERSION}</cpacsVersion>
    <versionInfos>
      <versionInfo version="1.0.0">
        <cpacsVersion>${CPACS_VERSION}</cpacsVersion>
        <description>${esc(`Exported by ${tool}; layout ${inputs.configType ?? "liftcruise"}; input hash ${inputHash}`)}</description>
        <timestamp>${ts}</timestamp>
        <creator>${esc(tool)}</creator>
      </versionInfo>
    </versionInfos>
  </header>
  <vehicles>
    <rotorcraft>
      <model uID="evtolSizerModel">
        <name>${esc(name)}</name>
        <description>${esc(R.configLabel ?? inputs.configType ?? "")}</description>
        <reference>
          <area>${num(refArea)}</area>
          <length>${num(refLen)}</length>
          <point uID="evtolSizerRefPoint"><x>0</x><y>0</y><z>0</z></point>
        </reference>
        <global>
          <cargoCapacity>${num(payload)}</cargoCapacity>
          <machCruise>${num(R.Mach, 4)}</machCruise>
          <configuration>${esc(`${inputs.configType ?? "liftcruise"}; ${nRot} rotors of ${num(diam, 3)} m; reference ${winged ? "wing area and mean aerodynamic chord" : "total rotor disk area and rotor diameter (no wing)"}`)}</configuration>
        </global>
        <analyses>
          <massBreakdown>
            <designMasses>
              <mTOM uID="mTOM"><mass>${num(MTOW)}</mass></mTOM>
              <mZFM uID="mZFM"><description>Battery aircraft: no fuel, so equal to take-off mass</description><mass>${num(MTOW)}</mass></mZFM>
              <mMLM uID="mMLM"><description>Lands at take-off mass</description><mass>${num(MTOW)}</mass></mMLM>
              <mMRM uID="mMRM"><description>Taxis at take-off mass</description><mass>${num(MTOW)}</mass></mMRM>
            </designMasses>
            <payload>
${mass("mPayload", payload, "Payload", "              ")}
            </payload>
            <fuel>
${mass("mFuel", 0, "Fuel (none: battery-electric)", "              ")}
            </fuel>
            <mOEM>
${mass("mOEM", OEM, "Operating empty mass (empty mass plus battery)", "              ")}
            <mEM>
${mass("mEM", OEM, "Empty mass including the battery", "              ")}
${groups}
            </mEM>
            </mOEM>
          </massBreakdown>
        </analyses>
      </model>
    </rotorcraft>
  </vehicles>
</cpacs>
`;
}
