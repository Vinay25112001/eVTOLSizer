/* =====================================================================
   VERTICAL CENTRE OF GRAVITY — E, the CG height above the ground
   =====================================================================
   `balance.js` gives every mass item a LONGITUDINAL station and says so
   in its own provenance vocabulary. This module gives the same items a
   VERTICAL one, in the same vocabulary, and sums them into E.

   WHY E IS WORTH BUILDING. Three of the gear criteria are measured from
   it and none of them can be evaluated without it: NACA SR-63's turnover
   (25) and tip-back (26) both carry `h + r`, the CG height above ground,
   and 14 CFR 25.493(e)'s braked nose reaction carries E directly. G6 is
   blocked on this module.

   WHY IT IS NOT SELF-CONSISTENCY. E is measurable from published data
   without any model at all. 25.493-style statics on Boeing's own
   published static and braked nose loads give

       E = (A+B)(V_braked - V_static) / (W a/g)

   with a the 10 ft/s^2 deceleration the ACAP tabulates and g standard
   gravity, so a/g is about 0.31. The number is deliberately NOT written
   out here: this codebase keeps one gravity and the constants gate
   enforces that a physical constant never appears with a value of its
   own, comments included. It caught this line.

   and the ACAPs publish both loads and the wheelbase. Across the five
   737 MAX variants that returns 2.857 m with a 1.0 % spread, and across
   six 777-200/-200ER weights 5.092 m with 0.65 %. The 737 family is the
   proof: its wheelbase spans +37 % while Boeing's load-difference ratio
   falls -36 %, varying exactly as needed to hold E constant. Those two
   numbers come from outside this codebase and cannot be tuned by it.

   THE AXES ARE THE DRAWING'S. z is up, the origin is on the fuselage
   centreline, so every station below the centreline is negative and

       E = z_cg - groundZ

   with `groundZ` from `geometry.js`'s stance model. That means E
   inherits the stance's provenance: the ground line is checked against
   Boeing's published clearance on the transport and is a convention
   elsewhere, so E is only as external as the stance under it.

   WHAT IS HONEST ABOUT THE STATION LIST BELOW. Very little of it is
   sourced, and pretending otherwise would be the whole failure mode
   here. Three kinds of station appear and they are labelled apart:

     `sourced`  a published number. There is exactly ONE - the cabin
                floor, 0.6 m below the centreline and 0.2 m thick,
                Scholz Ch.6 p.6-5, already carried by
                fuselage-structure.js as FLOOR.
     `drawn`    a convention the general arrangement ALREADY uses to
                draw the aeroplane. Reusing them is not a new assumption
                - it is refusing to invent a second one - but they are
                conventions and stay labelled as such.
     `assumed`  this module's own choice, with no source and no drawing
                precedent. Every one is listed, and the gate measures
                what E does when each is moved.

   THE PART THE RESEARCH EXPECTED TO BE THE ONLY GAP WAS NOT THE ONLY
   GAP. The Phase C note expected the seated-occupant CG above the floor
   to be the single unsourced station. It is not: the gear, the systems
   group and the cockpit avionics are unsourced too. Rather than assert
   one and hide three, `sensitivity()` moves every assumed station across
   a stated range and reports what E does. A station that cannot move E
   is not worth arguing about; one that can is declared on the face of
   the result.
   ===================================================================== */
import { FLOOR } from "./fuselage-structure.js";

/* Provenance, matching geometry.js's vocabulary so a consumer can sort
   stations by how much they are worth trusting. */
const sourced = (value, cite) => ({ value, kind: "sourced", cite });
const drawn = (value, why) => ({ value, kind: "drawn", why });
const guessed = (value, why, range) => ({ value, kind: "assumed", why, range });

/* ── THE ASSUMED STATIONS, ALL OF THEM, IN ONE PLACE ──────────────────
   Every number this module invents. They are collected here rather than
   scattered through the assignment so that the list cannot quietly grow:
   the gate counts them and sweeps each one. */
export const ASSUMED = Object.freeze({
  /* A seated occupant's CG above the CABIN FLOOR. It is a chain of two
     terms and the first version of this collapsed them, which is how it
     came out 0.2 m too low:

         occupant CG above floor = seat pan height + CoM above the pan

     CoM ABOVE THE PAN. There is a real primary for this - Reed, M.P.
     (2006), "Whole-body Center of Mass Location in Seated Postures",
     UMTRI-2006-39, University of Michigan Transportation Research
     Institute - which reports about 244 mm for men, 226 mm for women,
     235 mm for a mixed population. IT IS CITED HERE BUT WAS NOT
     RETRIEVED: the Deep Blue repository refuses automated fetch and
     serves the document through a script, so those figures reached this
     comment from a search index and not from the report. By this
     project's own rule that is a LEAD, not evidence, and it is labelled
     as one rather than dressed up as a citation.

     What makes it usable anyway is that it can be corroborated without
     the report, from standard body-segment mass fractions: torso about
     50 % of body mass with its own CoM roughly 0.25 m above the pan,
     head 8 % at about 0.60 m, thighs 30 % at pan level, arms 12 % at
     about 0.20 m, giving 0.50(0.25) + 0.08(0.60) + 0.30(0) + 0.12(0.20)
     = 0.20 m. Two routes agreeing at 0.20-0.24 m is worth more than one
     unverified number.

     SEAT PAN HEIGHT has no free primary at all. SAE AS8049 is behind a
     paywall and is a crashworthiness performance standard rather than a
     geometry one; 14 CFR 25.815's "25 in. from floor" is a threshold in
     an AISLE WIDTH table and says nothing about seats, whatever it is
     convenient to read into it. So the pan is assumed at roughly 0.45 m
     and the whole chain stays `assumed`.

     0.45 + 0.22 = 0.67. The range spans a low seat with a short sitter
     to a high seat with a tall one. */
  occupantCgAboveFloorM: { value: 0.67, range: [0.50, 0.80],
    why: "seat pan height has no primary; the CoM above the pan has one "
       + "(Reed, UMTRI-2006-39) that could not be retrieved, corroborated "
       + "independently from body-segment mass fractions at 0.20-0.24 m" },
  /* Gear mass is wheels, brakes and the lower strut far more than the
     upper strut, so its centroid sits low between trunnion and ground.
     0.35 measures from the GROUND up, so a smaller number is lower. */
  gearCgFractionOfHeight: { value: 0.35, range: [0.20, 0.55],
    why: "no primary gives the mass distribution along a gear leg; wheels and "
       + "brakes dominate, so the centroid is low" },
  /* Systems run largely under the cabin floor - hydraulics, air
     conditioning ducts, the electrical bay - but not all of them. Taken
     at the floor underside, with a range spanning the centreline to the
     keel. */
  systemsCgM: { value: -0.80, range: [0.0, -1.40],
    why: "no primary places the systems group vertically; much of it runs "
       + "below the cabin floor but not all" },
  /* Instruments and avionics sit in the cockpit panel and the forward
     equipment bay, i.e. spread either side of the floor. */
  avionicsCgM: { value: -0.30, range: [0.30, -1.00],
    why: "no primary places the instrument panel and avionics bay vertically" },
});

/* Which items take which station. The names are balance.js's own. */
/* Powerplant. The class names differ: the jets say "Engines" and the
   trainer says "Engine", the turboprop adds "Propellers" and the trainer
   "Propeller". Missing any of them does not fail loudly, it silently
   drops mass out of the sum - which is how the trainer first came out
   with half its weight unplaced. */
const NACELLE_ITEMS = new Set([
  "Nacelles", "Engines", "Engine", "Engine section", "Thrust reversers",
  "Engine controls and starters", "Engine oil", "Oil",
  "Propellers", "Propeller",
]);
const CABIN_OCCUPANT_ITEMS = new Set([
  "Furnishings", "Passenger service", "Cabin crew",
]);
const COCKPIT_OCCUPANT_ITEMS = new Set(["Flight crew"]);
const AVIONICS_ITEMS = new Set(["Instruments", "Avionics"]);
const SYSTEMS_ITEMS = new Set([
  "Surface controls", "Flight controls", "Hydraulics", "Electrical",
  "Air conditioning", "Anti-icing", "APU", "Fixed equipment",
]);
/* The shell and anything smeared over it. A uniform shell's centroid is
   its own axis; paint is the definition of smeared over it. */
const SHELL_ITEMS = new Set(["Fuselage", "Paint"]);
/* Fuel lives in the wing box, so unusable fuel does too. balance.js puts
   it at the systems STATION longitudinally, which is a simplification it
   makes for x; this module does not copy that simplification into z,
   because the physical answer is available and differs. */
const WING_ITEMS = new Set(["Wing", "Fuel system", "Unusable fuel"]);

/* Spanwise centroid of a straight-tapered surface, as a fraction of
   span from the root: (1/3)(1+2λ)/(1+λ). Plain geometry, exact. */
export function taperedCentroidFraction(taper) {
  const t = Math.max(0, Math.min(1, Number(taper)));
  return (1 / 3) * (1 + 2 * t) / (1 + t);
}

/* ── THE STATION TABLE ────────────────────────────────────────────────
   One z for every item balance.js produces, each carrying why it is
   where it is. `ga` is the general arrangement; `H` the fuselage depth. */
export function verticalStations({ ga, fuselageHeightM, assumed = ASSUMED }) {
  const H = fuselageHeightM;
  const val = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);

  const wingZ = val(ga.wing.z);
  const htZ = val(ga.ht.z);
  const groundZ = ga.stance.z;

  /* The fin's own centroid, from its root at the crown. */
  const vtRootZ = H / 2;
  /* The GA does not republish the fin's taper, but it publishes its root
     and tip chords, and taper IS tip/root. Deriving it is exact and
     avoids carrying a second, possibly stale, copy of the number. */
  const vtTaper = ga.vt.root > 0 ? ga.vt.tip / ga.vt.root : 0.3;
  const vtZ = vtRootZ + ga.vt.height * taperedCentroidFraction(vtTaper);

  /* Nacelle z, straight off the drawing; a class with no nacelle falls
     back to the wing, which is where its powerplant is. */
  /* Nacelles if the aeroplane has them; otherwise the propeller disc,
     which is where a nose-mounted engine actually is. Falling straight
     through to the wing put the trainer's engine half a metre below its
     own thrust line. */
  const nacZ = ga.nacelles && ga.nacelles.length
    ? ga.nacelles.reduce((t, n) => t + n.z, 0) / ga.nacelles.length
    : (ga.props && ga.props.length
        ? ga.props.reduce((t, n) => t + n.z, 0) / ga.props.length
        : wingZ);

  /* The floor, and the only sourced station in this module. */
  const floorTopZ = -FLOOR.dropMeanM;
  const floorBottomZ = floorTopZ - FLOOR.thicknessM;

  /* The below-floor hold. B3 gives the holds a LENGTH and no depth, so
     the depth is established here: the hold is the volume between the
     floor underside and the shell, and its centroid is the middle of
     that. Derived from a sourced floor and a sized shell, so it is not
     an assumption - but it is not published either. */
  const holdZ = (floorBottomZ + (-H / 2)) / 2;

  const occZ = floorTopZ + assumed.occupantCgAboveFloorM.value;
  const gearZ = groundZ + (wingZ - groundZ) * assumed.gearCgFractionOfHeight.value;

  const table = new Map();
  const put = (name, station) => table.set(name, station);

  SHELL_ITEMS.forEach((n) => put(n, drawn(0,
    "a uniform shell's centroid is its own axis")));
  WING_ITEMS.forEach((n) => put(n, drawn(wingZ,
    "the wing's vertical station on the body, as the drawing places it")));
  put("Horizontal tail", drawn(htZ, "the tailplane station the drawing uses"));
  put("Vertical tail", drawn(vtZ,
    "the fin's own spanwise centroid above its root at the crown"));
  NACELLE_ITEMS.forEach((n) => put(n, drawn(nacZ,
    "the nacelle station the drawing uses")));

  put("Cargo containers", drawn(holdZ,
    "the hold is the volume between the floor underside and the shell; "
    + "its centroid is the middle of that"));

  CABIN_OCCUPANT_ITEMS.forEach((n) => put(n, guessed(occZ,
    assumed.occupantCgAboveFloorM.why, assumed.occupantCgAboveFloorM.range)));
  COCKPIT_OCCUPANT_ITEMS.forEach((n) => put(n, guessed(occZ,
    assumed.occupantCgAboveFloorM.why, assumed.occupantCgAboveFloorM.range)));
  AVIONICS_ITEMS.forEach((n) => put(n, guessed(assumed.avionicsCgM.value,
    assumed.avionicsCgM.why, assumed.avionicsCgM.range)));
  SYSTEMS_ITEMS.forEach((n) => put(n, guessed(assumed.systemsCgM.value,
    assumed.systemsCgM.why, assumed.systemsCgM.range)));

  /* The trainer reports one combined "Landing gear" item. */
  put("Landing gear", guessed(gearZ, assumed.gearCgFractionOfHeight.why,
    assumed.gearCgFractionOfHeight.range));
  put("Main gear", guessed(gearZ, assumed.gearCgFractionOfHeight.why,
    assumed.gearCgFractionOfHeight.range));
  put("Nose gear", guessed(gearZ, assumed.gearCgFractionOfHeight.why,
    assumed.gearCgFractionOfHeight.range));

  return {
    table,
    floor: sourced(floorTopZ, FLOOR.source),
    references: { wingZ, htZ, vtZ, nacZ, holdZ, occZ, gearZ, groundZ, floorTopZ, floorBottomZ },
  };
}

/* ── E ────────────────────────────────────────────────────────────────
   The mass-weighted vertical CG, and its height above the ground.

   THE RESIDUAL IS HANDLED THE WAY B3 HANDLED IT. balance.js carries an
   "Unitemised balance of the operating empty weight" item - the FLOPS
   empty-weight margin, which is a scalar with no station. Longitudinally
   B3 places it at the centroid of the itemised masses, where a uniform
   allowance belongs and where it is provably CG-neutral. The same
   argument applies in z and the same treatment is used, so the residual
   moves E by nothing and the gate checks that it moves E by nothing. */
export function verticalCg({ balance, ga, fuselageHeightM, assumed = ASSUMED }) {
  const stations = verticalStations({ ga, fuselageHeightM, assumed });
  const items = balance.items || [];
  const massOf = (it) => Number(it.massKg ?? it.mass ?? it.kg ?? 0);

  const placed = [], unplaced = [];
  for (const it of items) {
    const name = it.name || it.item;
    if (/^Unitemised/.test(name)) continue;          // handled after the centroid is known
    const st = stations.table.get(name);
    if (!st) { unplaced.push(name); continue; }
    placed.push({ name, massKg: massOf(it), z: st.value, station: st });
  }

  const itemisedMass = placed.reduce((t, p) => t + p.massKg, 0);
  const itemisedMoment = placed.reduce((t, p) => t + p.massKg * p.z, 0);
  const centroidZ = itemisedMass > 0 ? itemisedMoment / itemisedMass : 0;

  const residual = items.find((it) => /^Unitemised/.test(it.name || it.item));
  if (residual) {
    placed.push({ name: residual.name || residual.item, massKg: massOf(residual),
                  z: centroidZ,
                  station: drawn(centroidZ,
                    "a uniform allowance with no station belongs at the centroid of the "
                    + "itemised masses, where it is CG-neutral by construction") });
  }

  const massKg = placed.reduce((t, p) => t + p.massKg, 0);
  const zCg = massKg > 0 ? placed.reduce((t, p) => t + p.massKg * p.z, 0) / massKg : 0;
  const groundZ = ga.stance.z;

  return {
    zCgM: zCg,
    eM: zCg - groundZ,
    centrelineHeightM: -groundZ,
    massKg, items: placed, unplaced,
    stations,
    /* E is only as external as the ground line beneath it. */
    stanceProvenance: ga.stance.zProvenance.kind
      || (ga.stance.zProvenance.sourced ? "sourced" : "drawn"),
    why: ga.stance.validated
      ? "E is measured from a ground line checked against published clearance data"
      : "E is measured from a ground line that has no published check on this class",
  };
}

/* ── THE LOADED AEROPLANE, WHICH IS THE ONE THE ACAP DESCRIBES ────────
   `verticalCg` sums balance.items, and balance.items is the OPERATING
   EMPTY build-up: crew and furnishings, no passengers, no cargo, no
   fuel. The published E this module is validated against is back-solved
   from ACAP ground loads at MAXIMUM DESIGN TAXI WEIGHT, which is the
   loaded aeroplane. Comparing the two is comparing an empty aeroplane's
   CG height against a full one's, and the first version of this module
   did exactly that.

   The three loads that close the gap all have stations this module has
   already had to define, so nothing new is invented:

     passengers   the occupant station, above the floor
     baggage and  the hold station, below the floor
       cargo
     fuel         the wing station - the tanks are the wing box

   IT TURNS OUT TO BARELY MATTER, and that is a result rather than an
   excuse. Fuel is the largest single addition and sits low, at the wing;
   passengers sit high, above the floor; cargo sits lowest of all. They
   very nearly cancel, so the loaded and empty vertical CGs differ by
   about a centimetre. That is itself corroboration: the 737 family's
   published E is constant to 1 % across five variants of quite different
   weight, which is only possible if E is insensitive to load, and this
   model reproduces that insensitivity rather than assuming it. */
export function loadedVerticalCg({ balance, ga, fuselageHeightM, assumed = ASSUMED }) {
  const empty = verticalCg({ balance, ga, fuselageHeightM, assumed });
  const ld = balance.loadingDiagram;
  const refs = empty.stations.references;
  const extra = [];

  if (ld && ld.available) {
    const pax = ld.payload ? Number(ld.payload.paxKgTotal || 0) : 0;
    if (pax > 0) extra.push({ name: "Passengers", massKg: pax, z: refs.occZ });

    /* The holds already carry their split of baggage and cargo. */
    for (const h of (ld.holds || [])) {
      if (h.massKg > 0) {
        extra.push({ name: `Hold: ${h.label || h.id}`, massKg: h.massKg,
                     /* A hold that is not a hold - the improvised cabin-centroid
                        case B3 declares - has no below-floor volume to sit in,
                        so it rides where B3 put it, at the cabin. */
                     z: h.improvised ? refs.occZ : refs.holdZ });
      }
    }
    /* Fuel: whatever the take-off weight needs beyond empty and payload.
       Taken from the weights rather than from tank capacity, so it is the
       fuel actually aboard at the design condition. */
    const payloadKg = extra.reduce((t, e) => t + e.massKg, 0);
    const fuelKg = Math.max(0, (balance.takeoff?.massKg || 0) - empty.massKg - payloadKg);
    if (fuelKg > 0) extra.push({ name: "Fuel", massKg: fuelKg, z: refs.wingZ });
  }

  const all = [...empty.items, ...extra];
  const massKg = all.reduce((t, p) => t + p.massKg, 0);
  const zCg = massKg > 0 ? all.reduce((t, p) => t + p.massKg * p.z, 0) / massKg : 0;
  return {
    zCgM: zCg, eM: zCg - ga.stance.z, massKg,
    added: extra, emptyE: empty.eM,
    loadShiftM: (zCg - ga.stance.z) - empty.eM,
  };
}

/* ── WHAT THE ASSUMPTIONS ARE WORTH ───────────────────────────────────
   Moves each assumed station across its stated range, one at a time,
   and reports the excursion in E. This is the honest centre of the
   module: if an assumption can swing E by more than the 1 % spread the
   published back-solve achieves, E is not really a prediction in that
   direction and the result must say so. */
export function sensitivity({ balance, ga, fuselageHeightM }) {
  const base = verticalCg({ balance, ga, fuselageHeightM });
  const out = [];
  for (const [key, spec] of Object.entries(ASSUMED)) {
    const [lo, hi] = spec.range;
    const ends = [];
    for (const v of [lo, hi]) {
      /* A COPY, never a mutation of the shared table. Object.freeze is
         shallow, so writing spec.value would have silently changed the
         module's own defaults for every later caller in the process. */
      const over = { ...ASSUMED, [key]: { ...spec, value: v } };
      ends.push(verticalCg({ balance, ga, fuselageHeightM, assumed: over }).eM);
    }
    const swing = Math.abs(ends[1] - ends[0]);
    out.push({ key, range: spec.range, eAtLo: ends[0], eAtHi: ends[1],
               swingM: swing, swingPctOfE: base.eM ? swing / base.eM : 0, why: spec.why });
  }
  out.sort((a, b) => b.swingM - a.swingM);
  return { baseE: base.eM, drivers: out };
}
