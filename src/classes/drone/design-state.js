/* =====================================================================
   DESIGN STATE — one design, read by every tab
   =====================================================================
   The studio had each tab computing for itself, which meant the
   Propulsion tab could describe a different aircraft from the one the
   Sizing tab had just sized. This module holds the single design the
   whole studio is looking at: the inputs, the parts they select, and the
   converged result.

   It is a plain hook rather than a context, because there is exactly one
   consumer tree and a context would add indirection without removing
   any.
   ===================================================================== */
import { useMemo, useState } from "react";
import { PROPELLERS, findPropeller } from "../../data/drone-propellers.js";
import { MODELLABLE_MOTORS, ESCS, BATTERIES } from "../../data/drone-components.js";
import { assemblePack } from "./battery.js";
import { sizeDrone, isaDensity } from "./sizing.js";

export const PROP_CHOICES = PROPELLERS
  .filter((p) => p.static?.length >= 4 && p.diameterM >= 0.15 && p.diameterM <= 0.48)
  .sort((a, b) => a.diameterM - b.diameterM);

export const DESIGN_DEFAULTS = Object.freeze({
  payloadKg: 0.5, hoverEnduranceMin: 15, rotors: 4, altitudeM: 0,
  propellerId: "apce_14x7_static_1006od", propellerMassG: 45,
  motorModel: "KDE4213XF-360", escId: null, cellId: "molicel-inr21700-p42a",
  series: 6, parallel: 3, packOverhead: 0.15,
  structureMassKg: 0.6, usableFraction: 0.85, avionicsMassKg: 0.15,
  avionicsPowerW: 8, thrustToWeightRequired: 2.0,
});

export function useDroneDesign() {
  const [v, setV] = useState(DESIGN_DEFAULTS);
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
  const reset = () => setV(DESIGN_DEFAULTS);

  const built = useMemo(() => {
    const propeller = findPropeller(v.propellerId) ?? PROP_CHOICES[0];
    const motor = MODELLABLE_MOTORS.find((m) => m.model === v.motorModel) ?? MODELLABLE_MOTORS[0];
    const esc = (v.escId ? ESCS.find((e) => e.id === v.escId) : null)
      ?? ESCS.find((e) => e.continuous_current_a >= 40) ?? ESCS[0];
    const cell = BATTERIES.find((b) => b.id === v.cellId) ?? BATTERIES[0];
    let pack = null, packError = null;
    try {
      pack = assemblePack(cell, {
        series: Math.round(v.series), parallel: Math.round(v.parallel),
        overheadFraction: v.packOverhead,
      });
    } catch (e) { packError = e.message; }
    return { propeller, motor, esc, cell, pack, packError };
  }, [v.propellerId, v.motorModel, v.escId, v.cellId, v.series, v.parallel, v.packOverhead]);

  const mission = useMemo(
    () => ({ payloadKg: v.payloadKg, hoverEnduranceMin: v.hoverEnduranceMin }),
    [v.payloadKg, v.hoverEnduranceMin]);

  const declared = useMemo(() => ({
    structureMassKg: v.structureMassKg, usableFraction: v.usableFraction,
    avionicsMassKg: v.avionicsMassKg, avionicsPowerW: v.avionicsPowerW,
    thrustToWeightRequired: v.thrustToWeightRequired,
  }), [v.structureMassKg, v.usableFraction, v.avionicsMassKg, v.avionicsPowerW, v.thrustToWeightRequired]);

  const selection = useMemo(() => (built.pack ? {
    rotors: Math.round(v.rotors), propeller: built.propeller, propellerMassG: v.propellerMassG,
    motor: built.motor, esc: built.esc, battery: built.pack,
    packVoltageV: built.pack.voltagePrintedV, packCells: built.pack.cellsSeries,
  } : null), [built, v.rotors, v.propellerMassG]);

  const result = useMemo(() => {
    if (!selection) return { status: "infeasible", reason: "pack could not be assembled", detail: built.packError };
    try {
      return sizeDrone({ mission, selection, declared, options: { altitudeM: v.altitudeM } });
    } catch (e) { return { status: "infeasible", reason: "inputs rejected", detail: e.message }; }
  }, [mission, selection, declared, v.altitudeM]);

  const ok = !!(result.status && result.status.startsWith("converged"));
  return { v, set, setV, reset, built, mission, declared, selection, result, ok, rho: isaDensity(v.altitudeM) };
}
