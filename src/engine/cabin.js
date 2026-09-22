/* =====================================================================
   THE CABIN MUST PHYSICALLY CONTAIN THE PEOPLE IT IS CARRYING
   =====================================================================
   `fusLen` is a slider and `payload` is a slider and nothing connected
   them. On the multicopter — the one layout whose fuselage is NOT floored
   by the room its rotor array needs, because its rotors are on arms —
   that decoupling is the largest unconstrained lever in this engine:

       fineness 3.56, fusLen 5.87 m    MTOW 5654.8 kg
       fineness 2.26, fusLen 3.73 m    MTOW 4692.5 kg
       fineness 1.47, fusLen 2.43 m    MTOW 4240.0 kg

   a 25% swing in gross weight, and every one of those runs was still
   carrying 455 kg — five occupants — in a cabin that shrank to 2.43 m.
   The lightest answer was a two-seat pod hauling five people's mass, and
   nothing in the tool objected. That is not a saving; it is a missing
   constraint, and this module is that constraint.

   ── WHAT AN OCCUPANT WEIGHS ──────────────────────────────────────────
   NASA, "VTOL Urban Air Mobility Concept Vehicles for Technology
   Development" (Silva, Johnson, Antcliff, Patterson, NASA/20180006683),
   verbatim:

     "a significantly larger payload of 6 occupants at 1200 lb total
      versus the earlier 1 occupant for 220 lb"

   and, at its section II: "1200 lb payload weight—up to six passengers".
   1200 lb / 6 = 200 lb = 90.718 kg per occupant, from the same NASA study
   whose Table 12 this engine is benchmarked against.

   Note the single-occupant case is 220 lb, not 200. NASA does not say why,
   and a per-occupant allowance that varies with occupancy cannot be
   derived from two points, so the six-occupant figure is used throughout
   and the discrepancy is recorded rather than smoothed over.

   ── HOW MUCH FLOOR AN OCCUPANT NEEDS ─────────────────────────────────
   MEASURED FROM ONE VEHICLE, AND THAT IS A WEAKNESS, NOT A CITATION.
   A two-seat cabin concept supplied for this work measures

       length 2.2 m  x  width 1.5 m  x  height 1.9 m

   giving 3.30 m^2 of gross plan area for 2 occupants, or 1.65 m^2 each.
   Gross is the right basis because it is what `fusLen * fusDiam` measures
   in this engine: an outer bounding box including the nose and tail taper,
   not usable floor.

   It is the ONE measured cabin. The rest of the population — eight UAM
   multicopters from Yang et al. 2024 Table 4, see CABIN_POPULATION below —
   are image estimates by the paper's own statement. Across the eight with
   a known seat count the gross plan area runs 1.60 to 3.12 m^2 per
   occupant, mean 2.21; the measured 1.65 sits at the bottom of that range,
   which is what a floor should do. (Yang's paper was on disk as
   Multi_1.txt the whole time MDPI was refusing to serve it.)

   ── WHY A CIRCLE WILL NOT DO ─────────────────────────────────────────
   The reference cabin is TALLER THAN IT IS WIDE, 1.9 against 1.5. The
   engine carries one `fusDiam` and treats the body as circular, so:

       true elliptical section  pi/4 * 1.5 * 1.9  =  2.238 m^2
       circle of D = width 1.5                   =  1.767 m^2   -21.1%
       circle of D = height 1.9                  =  2.835 m^2   +26.7%

   Neither is acceptable for a term that drives drag and wetted area. The
   area-equivalent diameter sqrt(W*H) = 1.688 m reproduces the ellipse
   exactly and is what a single-diameter model should be given.
   ===================================================================== */

/* 200 lb. NASA/20180006683: 6 occupants at 1200 lb total. */
export const OCCUPANT_MASS_KG = 90.718;

/* NASA's own single-occupant figure, 220 lb, kept because it disagrees
   with 1200/6 and that disagreement is data, not noise. Not used in
   sizing; exported so a harness can assert we still know about it. */
export const OCCUPANT_MASS_SINGLE_KG = 99.79;

/* Gross plan area per occupant, m^2. One measured vehicle — see above. */
export const CABIN_FLOOR_PER_OCCUPANT_M2 = 1.65;

/* The reference cabin's section aspect, height / width. */
export const CABIN_HEIGHT_WIDTH_RATIO = 1.9 / 1.5;

export const CABIN_REFERENCE = {
  occupants: 2, lengthM: 2.2, widthM: 1.5, heightM: 1.9,
  src: "two-seat cabin concept supplied 2026-09-10; bounding box measured in "
     + "SolidWorks by the author. The one MEASURED cabin in CABIN_POPULATION",
};

/* ── THE POPULATION BEHIND THE FLOOR ───────────────────────────────
   Yang, Liang, Pröbsting, Li, Zhang, Hu, "Sizing of Multicopter Air Taxis --
   Weight, Endurance, and Range", Aerospace 2024, 11, 200, Table 4 "Fuselage
   dimension of UAM multicopters", verbatim rows. READ THIS SESSION from the
   paper itself, not from a code comment.

   ITS OWN CAVEAT, verbatim: "The dimensions for existing models are inferred
   from images using a scale method with a reference object in the image."
   These are image ESTIMATES with unstated error. Seat counts are from the
   paper's text (§2: "Single-seat multicopters are dominated by coaxial",
   "SD-03 accommodates a single passenger", "Gelisim University TUSI is a
   single-seat", and "two-seat multicopters" for the VoloCity, VC200, EHang
   216 and Voyager X2). PAV-X's occupancy is not stated and it is excluded.

   Gross plan area per occupant across the eight with a known seat count:
   min 1.60 (TUSI), mean 2.21, max 3.12 (VoloCity). The supplied reference
   at 1.65 sits at the bottom of that range, 3% above the minimum -- which is
   inside an image estimate's noise, and is why the CAD-measured 1.65 stays
   the floor rather than being pulled down to an estimated 1.60. */
export const CABIN_POPULATION = [
  { name: "VoloCity",         occupants: 2, lengthM: 3.9, widthM: 1.6, heightM: 1.6, basis: "image estimate, Yang 2024 T4" },
  { name: "VC200",            occupants: 2, lengthM: 2.9, widthM: 1.4, heightM: 1.6, basis: "image estimate, Yang 2024 T4" },
  { name: "EHang 216",        occupants: 2, lengthM: 2.3, widthM: 1.4, heightM: 1.5, basis: "image estimate, Yang 2024 T4" },
  { name: "XPeng Voyager X2", occupants: 2, lengthM: 3.7, widthM: 1.5, heightM: 1.1, basis: "image estimate, Yang 2024 T4" },
  { name: "SkyDrive SD-03",   occupants: 1, lengthM: 3.2, widthM: 0.9, heightM: 0.9, basis: "image estimate, Yang 2024 T4" },
  { name: "EHang 184",        occupants: 1, lengthM: 2.0, widthM: 1.0, heightM: 1.1, basis: "image estimate, Yang 2024 T4" },
  { name: "Gelisim TUSI",     occupants: 1, lengthM: 2.0, widthM: 0.8, heightM: 1.2, basis: "image estimate, Yang 2024 T4" },
  { name: "supplied concept", occupants: 2, lengthM: 2.2, widthM: 1.5, heightM: 1.9, basis: "CAD measured, 2026-09-10" },
];

/** Gross plan area per occupant across the population. */
export function cabinPopulationStats() {
  const per = CABIN_POPULATION.map((v) => v.lengthM * v.widthM / v.occupants);
  const min = Math.min(...per), max = Math.max(...per);
  const mean = per.reduce((a, b) => a + b, 0) / per.length;
  return { n: per.length, min, mean, max, perOccupant: per };
}

/** Occupants implied by a payload mass, at NASA's 200 lb each. */
export function occupantsFromPayload(payloadKg) {
  const m = Number(payloadKg);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return m / OCCUPANT_MASS_KG;
}

/** Payload mass for a whole number of occupants. */
export function payloadFromOccupants(n) {
  const k = Number(n);
  if (!Number.isFinite(k) || k <= 0) return 0;
  return k * OCCUPANT_MASS_KG;
}

/** Gross cabin plan area a given occupancy requires, m^2. */
export function cabinFloorRequired(nOccupants) {
  const n = Number(nOccupants);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * CABIN_FLOOR_PER_OCCUPANT_M2;
}

/**
 * Area-equivalent diameter of a non-circular section, so a single-diameter
 * body model carries the true frontal area. sqrt(W*H) because
 * pi/4*D^2 = pi/4*W*H exactly when D = sqrt(W*H).
 */
export function equivalentDiameter(widthM, heightM) {
  const w = Math.max(0, Number(widthM) || 0);
  const h = Math.max(0, Number(heightM) || 0);
  if (w <= 0 || h <= 0) return 0;
  return Math.sqrt(w * h);
}

/**
 * Can this body hold these people? Compares the gross plan area the
 * fuselage provides against what the occupancy needs.
 *
 * Reports; it does not clamp. Silently growing the cabin would change a
 * user's stated geometry without saying so, and this engine states what is
 * wrong rather than quietly repairing it.
 */
export function cabinAdequacy({ fusLen, fusDiam, payload, nOccupants }) {
  const L = Number(fusLen) || 0;
  const W = Number(fusDiam) || 0;
  const n = Number.isFinite(Number(nOccupants)) && Number(nOccupants) > 0
    ? Number(nOccupants)
    : occupantsFromPayload(payload);
  const provided = L * W;
  const required = cabinFloorRequired(n);
  const minLen = W > 0 ? required / W : Infinity;
  return {
    occupants: n,
    providedM2: provided,
    requiredM2: required,
    ok: required <= 0 || provided >= required - 1e-9,
    shortfallM2: Math.max(0, required - provided),
    minFuselageLenM: minLen,
    perOccupantM2: n > 0 ? provided / n : null,
  };
}
