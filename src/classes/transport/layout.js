/* =====================================================================
   TRANSPORT LAYOUT — where the engines are, and how big the tails are
   =====================================================================
   Engine location decides which FLOPS terms apply (NASA/TM-2017-219627:
   NEW wing-mounted engines, NEF fuselage-mounted engines). In the FLOPS
   port that means wing bending relief (Eq 38, CAYE = 1 − 0.03 NEW), the
   fuselage (Eq 56, ×(1 + 0.05 NEF)), instruments (Eq 102), hydraulics
   (Eq 104) and the horizontal-tail wetted area:

     wing           all engines under the wing
     aft-fuselage   all engines on the rear fuselage (DC-9, CRJ, business jets)
     wing+tail      all but one under the wing, one in the fin (DC-10, MD-11)
     fuselage-3     three on the rear fuselage and fin (727, Trident, Falcon 7X)

   Aft-mounted nacelles add drag: "an increase in drag coefficient of
   approximately 0.0021 at test Mach numbers below 0.76 ... about 0.0007 at
   a Mach number of 0.82" (Putnam & Trescot, NASA TN D-3781, 1966, p.3),
   interpolated linearly between those Mach numbers here. That study
   measured a twin-jet model; no public equivalent was found for wing-mounted
   nacelles, so none is added for them.

   Tail areas from tail volume coefficients (Scholz 2021, "Empennage sizing
   using the tail volume ...", INCAS Bulletin 13(3), read from the rendered
   pages):
     C_H = S_H l_H / (S_W c_MAC),  C_V = S_V l_V / (S_W b_W)          (Eq 1)
     lever arms, AC to AC, as a fraction of fuselage length l_F (m):
       wing engines   l_H/l_F = −0.00064 l_F + 0.502,
                      l_V/l_F = −0.00088 l_F + 0.491                   (Eq 3)
       rear engines   l_H/l_F = −0.0024 l_F + 0.511,
                      l_V/l_F = −0.00018 l_F + 0.366                   (Eq 4)
     averages (Table 2): jet transport C_H 0.991, C_V 0.0793;
                         business jet  C_H 0.694, C_V 0.0722;
                         regional turboprop 1.004 / 0.0790;
     "For T-tails the given tail volume coefficients may be reduced by 4%."
   ===================================================================== */

export const ENGINE_LOCATIONS = Object.freeze(["wing", "aft-fuselage", "wing+tail", "fuselage-3"]);
export const TAIL_VOLUME = Object.freeze({
  "jet-transport": { CH: 0.991, CV: 0.0793 },
  "business-jet": { CH: 0.694, CV: 0.0722 },
  "regional-turboprop": { CH: 1.004, CV: 0.0790 },
});

export function engineSplit(location, n) {
  switch (location) {
    case "wing": return { onWing: n, onFuselage: 0 };
    case "aft-fuselage": return { onWing: 0, onFuselage: n };
    case "wing+tail": return { onWing: n - 1, onFuselage: 1 };
    case "fuselage-3": return { onWing: 0, onFuselage: n };
    default: throw new Error(`Unknown engine location "${location}" (known: ${ENGINE_LOCATIONS.join(", ")})`);
  }
}

export const rearEngines = (location) => location === "aft-fuselage" || location === "fuselage-3";

/* Drag increment of aft-fuselage nacelles, NASA TN D-3781. */
export function aftNacelleDeltaCd(location, mach) {
  if (!rearEngines(location)) return 0;
  if (mach <= 0.76) return 0.0021;
  if (mach >= 0.82) return 0.0007;
  return 0.0021 + (mach - 0.76) / (0.82 - 0.76) * (0.0007 - 0.0021);
}

/* Tail areas (same length unit as the wing: ft² with ft) from volume
   coefficients. fuselageLengthM is in metres for Scholz's Eq 3-4. */
export function tailAreas({ wingArea, span, taper, fuselageLength, fuselageLengthM, location, category, tTail }) {
  const vc = TAIL_VOLUME[category];
  if (!vc) throw new Error(`No tail volume coefficients for "${category}"`);
  const rear = rearEngines(location);
  const lF = fuselageLengthM;
  const lH = (rear ? -0.0024 * lF + 0.511 : -0.00064 * lF + 0.502) * fuselageLength;
  const lV = (rear ? -0.00018 * lF + 0.366 : -0.00088 * lF + 0.491) * fuselageLength;
  const cRoot = 2 * wingArea / (span * (1 + taper));
  const cMac = (2 / 3) * cRoot * (1 + taper + taper * taper) / (1 + taper);
  const k = tTail ? 0.96 : 1;
  return {
    htArea: k * vc.CH * wingArea * cMac / lH,
    vtArea: k * vc.CV * wingArea * span / lV,
    lH, lV, cMac, CH: k * vc.CH, CV: k * vc.CV,
  };
}
