/* =====================================================================
   LOADING DIAGRAM — the CG range a real loading can actually reach
   =====================================================================
   This is package B3 of eVTOL_Sizing_Research/classes/cross-class/
   BALANCE-AND-TAIL.md section 4.2, and it exists because balance.js said
   out loud that it was missing:

     "The loading sweep is passengers only, at zero fuel, packed forward
      and packed aft. It is not a loading diagram: no cargo holds, no
      fuel-tank sequence, no crew or catering steps."

   WHAT THE GAP COSTS, MEASURED. The analytic sweep balance.js already
   carries is TASOPT (A.280)-(A.282), and it is right about what it
   models — its critical load fractions reproduce Drela's converged 737
   run to within two points, and the gate asserts that. But it treats the
   cabin as a CONTINUUM: payload may sit anywhere between the two ends of
   the pressure shell. A continuum has no first row. Packed hard forward
   it puts mass at the forward bulkhead itself, which no seat occupies,
   and the unrestricted extreme that falls out is a CG range of 43.9 %
   MAC on the transport and 57.2 % on the turboprop. Published ranges are
   12 % (L-1011) to 34 % (DC-9 Super 80). The number was not wrong for
   what it computed; it was computing the wrong thing.

   A real cabin has seats at a pitch, holds fore and aft of the wing box,
   and tanks that fill in an order. That is what this module builds.

   ── WHAT IS SOURCED, AND WHAT IS A CONVENTION ────────────────────────
   Sourced, and used as the primary evidence:

     seat pitch        32 in economy / 39 in business / 61 in first.
                       Aviary `variable_meta_data.py` defaults
                       SEAT_PITCH_ECONOMY 32.0, _BUSINESS 39.0,
                       _FIRST 61.0; Airbus AC A320 2-4-1 p.3 confirms
                       the economy figure independently, "(6 ABREAST -
                       32 in PITCH)". CABIN-LAYOUT.md section 2.1.
     seats abreast     n_SA = 0.45 sqrt(n_PAX), Scholz Ch.6 eq. (6.1).
                       CABIN-LAYOUT.md section 1.1, where the radical is
                       confirmed numerically against Nita's ATR 72 study
                       (70 pax -> 3.76 -> 4 abreast) because pdftotext
                       drops the radical sign.
     hold length       k_CARGO = 0.35 (regional) to 0.55 (widebody) of
                       fuselage length, Scholz Ch.6 eq. (6.4).
                       CABIN-LAYOUT.md section 2.1.
     baggage density   170 kg/m^3, cargo 160 kg/m^3, Scholz Ch.6 p.6-10
                       attributing [TORENBEEK 88].
     the tank IS the   FAA AMT Handbook, quoted in STRUCTURAL-LAYOUT.md
     box between the   line 376: "Proper sealing of the structure allows
     spars             fuel to be stored in the box sections of the wing."
     spar positions    front 0.10 c, rear 0.60 c on the transport, from
                       Brooks, Kenway & Martins, AIAA J. 2018, Table 1
                       (uCRM-9 / 777). The other three classes are NOT
                       sourced and wing-structure.js says so; this module
                       inherits that and repeats the warning.
     the loading rules GASP, NASA CR-152303 Vol. V sections V.1.3.3 to
                       V.1.3.7, quoted verbatim in BALANCE-AND-TAIL.md
                       lines 208-235.
     the six orders    Scholz Ch.10 p.10-22: "If the normal loading
                       sequence is, for example: 1. Passengers, 2. Cargo,
                       3. Fuel, then the following sequences must also be
                       checked ... 1-3-2, 2-1-3, 2-3-1, 3-1-2, 3-2-1."
     the two lobes     Scholz Ch.10 p.10-22, window seats first: "If the
                       rear window seats are filled first, the weight and
                       center of gravity migrate upwards via the right
                       curve ... If the front window seats are filled
                       first, the left curve is followed."

   Conventions, each declared on the object it decorates:

     - the split of one wing tank into centre / inboard / outboard. The
       TOTAL tank centroid is computed, not chosen; the split exists only
       so that GASP's "all fuel tanks forward of FCGLIM" has something to
       bite on, and `tankSplitSensitivity` measures what it is worth.
     - the seat block centred on the cabin centroid.
     - holds filling the room fore and aft of the wing box, scaled to
       Scholz's k_CARGO.

   ── THREE THINGS THAT WOULD BE EASY TO GET WRONG ─────────────────────
   1. THE CREW IS ALREADY IN THE OPERATING EMPTY WEIGHT. GASP's rules
      each begin "1. pilot", because GASP's empty weight excludes the
      crew. Here the FLOPS operating-items group carries "Flight crew"
      and "Cabin crew" and balance.js has already given both a station,
      so adding a pilot again would count them twice. The rule is
      implemented from the SECOND line down, and this module says so
      rather than quietly dropping a step. The one exception is the
      trainer, whose payload is `(pax + 1) x massPerOccupant` — there the
      pilot IS in the payload, and the occupant count is taken as pax + 1.

   2. GASP'S 170 lb IS GASP'S PAYLOAD MODEL, NOT THIS TOOL'S. Section
      2.1(b) of the note records UWPAX as "200 lb (design case); the
      loading rules use 170 lb per passenger for the CG-extreme cases".
      This tool builds its payload from FLOPS inputs instead —
      massPerPassenger 165 lb plus baggagePerPassenger 35 lb plus a
      separate cargo mass — and that build-up reproduces the sized
      payload EXACTLY on all four classes, which is checked here. Taking
      GASP's 170 lb would put the diagram's gross weight at odds with the
      aeroplane the rest of the tool sized. So the rules are implemented
      with this tool's own masses, GASP's figures are reported beside
      them, and the substitution is stated instead of hidden.

   3. FCGLIM AND ACGLIM ARE INPUTS, NOT ANSWERS — and the first version
      of this module got that wrong. GASP fills "all seats forward of
      FCGLIM" to find the forward CG, which reads as self-referential,
      and it is tempting to close the circle by iterating until the
      loaded CG equals the limit. That converges, and it is meaningless:
      "fill everything forward of the answer" has the answer as a fixed
      point almost trivially, and the transport's forward limit came out
      at 2.8 % MAC with a straight face. The FORTRAN says otherwise —
      BALANCE-AND-TAIL.md line 253 —

          FCGLIM = ELWING - (CPMRGN + .25 - XCGFWD)*CBARW

      where XCGFWD is an INPUT CG limit in MAC fractions and ELWING the
      wing station. FCGLIM is that limit expressed as an absolute
      station. GASP's loop is over the WING POSITION and the TAIL SIZE
      (step 3: "Re-position wing so that c.g. at most forward loading
      condition (ELCGF) falls at forward c.g. stability and control limit
      (FCGLIM)"), not over the limit. So the limits here come from
      published envelopes, the loading is computed against them, and
      whether the result COMPLIES is the output. Closing GASP's actual
      loop needs a tail size, and that is B5.
   ===================================================================== */

import { SPARS_BY_CLASS } from "./wing-structure.js";

const IN = 0.0254, LB = 0.45359237;

/* Seat pitch. Aviary variable_meta_data.py defaults, cross-checked for
   economy against Airbus AC A320 2-4-1 p.3. CABIN-LAYOUT.md section 2.1. */
export const SEAT_PITCH_M = Object.freeze({
  first:    61 * IN,
  business: 39 * IN,
  economy:  32 * IN,
});
export const SEAT_PITCH_SOURCE =
  "Aviary variable_meta_data.py SEAT_PITCH_{ECONOMY 32.0, BUSINESS 39.0, FIRST 61.0} in; "
  + "Airbus AC A320 2-4-1 p.3 confirms economy independently at \"(6 ABREAST - 32 in PITCH)\"";

/* Scholz Ch.6 eq. (6.1). CABIN-LAYOUT.md section 1.1 confirms the radical
   numerically against Nita's ATR 72 study: 0.45*sqrt(70) = 3.765 -> 4. */
export const ABREAST_FLOOR = 2;
export function seatsAbreast(nPax) {
  if (!(nPax > 0)) return 0;
  return Math.max(ABREAST_FLOOR, Math.round(0.45 * Math.sqrt(nPax)));
}

/* A PREMIUM CABIN IS NARROWER THAN ECONOMY IN THE SAME TUBE, and putting
   first class six abreast because economy is six abreast made the seat
   block two metres too short. CABIN-LAYOUT.md section 2.1 gives the
   per-class figures: "n_seats_abreast_{economy,business,first} 6 / 5 / 4,
   Aviary variable_meta_data.py defaults (NUM_SEATS_ABREAST_ECONOMY 6,
   _BUSINESS 5, _FIRST 4); initial guess from eq. (1.1)".

   So economy comes from eq. (6.1), which is what that equation is for,
   and the premium cabins take Aviary's defaults — capped at the economy
   figure, because a cabin cannot fit more premium seats across than
   economy seats across. The cap is the one line here that is neither
   Scholz's nor Aviary's, and it only ever bites on a cabin narrower than
   four abreast, where Aviary's defaults were never meant to apply. */
export const ABREAST_BY_CLASS = Object.freeze({ first: 4, business: 5, economy: null });
export const ABREAST_SOURCE =
  "Aviary variable_meta_data.py NUM_SEATS_ABREAST_{ECONOMY 6, BUSINESS 5, FIRST 4}; economy from Scholz "
  + "Ch.6 eq. (6.1), n_SA = 0.45*sqrt(n_PAX)";

export function abreastFor(cls, nPaxTotal) {
  const economy = seatsAbreast(nPaxTotal);
  const dflt = ABREAST_BY_CLASS[cls];
  return dflt === null ? economy : Math.min(dflt, economy);
}

/* Scholz Ch.6 p.6-10, attributing [TORENBEEK 88]. */
export const HOLD = Object.freeze({
  baggageDensityKgM3: 170,
  cargoDensityKgM3: 160,
  /* eq. (6.4): "k_CARGO_COMPARTMENT assumes values of between 0.35 and
     0.55. The smaller value applies to regional planes and the larger
     values to widebody airliners." Nothing here is a widebody, so the
     regional end is taken and the choice is declared. */
  kHoldLength: 0.35,
  kSource: "Scholz Ch.6 eq. (6.4), regional end of the 0.35-0.55 band; no class here is a widebody",
});

/* XCGFWD and XCGAFT, GASP's input CG limits in MAC fractions. Only two
   published sources give a certificated envelope in per cent MAC at all,
   and BALANCE-AND-TAIL.md section 5 gap 5 records why: "EASA TCDS defer
   to the AFM/WBM for A320, ERJ190 and ATR. Only DC-9-80 (via CR-166138)
   and L-1011 (via CR-172278) give %MAC ranges." So:

     transports   12 % to 35 % MAC, the L-1011 standard envelope,
                  NASA CR-172278 p.3, section 3.1 of the note.
     trainer      15.5 % to 36.4 % MAC, converted in section 3.2 from
                  FAA TCDS 3A12 for the Cessna 172S — MAC 58.8 in, MAC
                  leading edge 25.9 in aft of datum, forward limit 35.0
                  to 41.0 in and aft limit 47.3 in aft of datum.

   ONE AEROPLANE PER CLASS IS NOT A CORRELATION. These are the envelopes
   of two specific aircraft, used because they are the only two in the
   public record, and the module reports the aircraft by name wherever it
   quotes a limit rather than presenting the pair as a standard. */
export const CG_LIMITS_BY_CLASS = Object.freeze({
  transport: { fwd: 0.12, aft: 0.35, from: "Lockheed L-1011 standard envelope, NASA CR-172278 p.3" },
  bizjet:    { fwd: 0.12, aft: 0.35, from: "Lockheed L-1011 standard envelope, NASA CR-172278 p.3 — no business jet envelope is published in per cent MAC" },
  turboprop: { fwd: 0.12, aft: 0.35, from: "Lockheed L-1011 standard envelope, NASA CR-172278 p.3 — no turboprop envelope is published in per cent MAC" },
  trainer:   { fwd: 0.155, aft: 0.364, from: "Cessna 172S, FAA TCDS 3A12, converted in BALANCE-AND-TAIL.md section 3.2" },
});

/* GASP's own figures, reported beside this tool's, never substituted for
   them. BALANCE-AND-TAIL.md section 2.1(b). */
export const GASP_FIGURES = Object.freeze({
  paxMassExtremesLb: 170,
  paxMassDesignLb: 200,
  minFuelTurbineFracOfWingCapacity: 0.20,
  minFuelPistonHpDivisor: 2,
  source: "NASA CR-152303 Vol. V sections V.1.3.3-V.1.3.7 and the UWPAX row of section 2.1(b)",
});

/* Which cabin class each aeroplane's seats are, and at what pitch. The
   transport and bizjet decks carry an explicit first/business/economy
   split; the turboprop and trainer carry a single number.

   SEATS INSTALLED IS NOT PASSENGERS CARRIED, and on the business jet
   they differ by more than a factor of two: its deck fits nine seats and
   flies four. FLOPS keeps both (`passengers` sizes the cabin, and its
   own `passengersCarried` is what the payload is built from), and the
   distinction is load-bearing here, because GASP's extremes fill SEATS
   — "All seats forward of FCGLIM are [filled] by passengers" — while
   the design condition carries the specified number. Conflating them
   made this module build a payload of 817 kg for an aeroplane the tool
   had sized to carry 363 kg. */
function cabinClasses(type, inputs) {
  const p = inputs ?? {};
  const rows = [];
  const add = (n, cls) => { if (n > 0) rows.push({ n, cls, pitchM: SEAT_PITCH_M[cls] }); };
  if (type === "transport" || type === "bizjet") {
    add(p.firstClass ?? 0, "first");
    add(p.businessClass ?? 0, "business");
    add(p.economyClass ?? 0, "economy");
  } else if (type === "turboprop") {
    add(p.passengers ?? 0, "economy");
  } else if (type === "trainer") {
    /* The trainer's payload is (pax + 1) x massPerOccupant: the pilot is
       IN the payload here, unlike every other class, where the flight
       crew is an operating item already inside the operating empty
       weight. Seat the pilot. */
    add((p.pax ?? 0) + 1, "economy");
  }
  return rows;
}

/* How many of those seats the design payload actually fills. */
function passengersCarried(type, inputs, nSeats) {
  const p = inputs ?? {};
  if (type === "bizjet" && p.passengersCarried > 0) return Math.min(nSeats, p.passengersCarried);
  return nSeats;
}

/* ── the seat grid ────────────────────────────────────────────────────
   Rows at their class's sourced pitch, premium forward, centred on the
   cabin centroid. Each row is one station carrying `abreast` seats. */
export function seatGrid({ type, inputs, xCabin, lCabin }) {
  const classes = cabinClasses(type, inputs);
  const nPax = classes.reduce((t, c) => t + c.n, 0);
  if (!(nPax > 0)) return { available: false, why: "this class reports no passenger count to seat" };

  const abreast = seatsAbreast(nPax);
  const blocks = classes.map((c) => {
    const ab = abreastFor(c.cls, nPax);
    const nRows = Math.ceil(c.n / ab);
    return { ...c, abreast: ab, nRows, lengthM: nRows * c.pitchM };
  });
  const seatedLengthM = blocks.reduce((t, b) => t + b.lengthM, 0);

  /* Centre the block on the cabin centroid, premium forward. Rows are
     placed at the centre of their own pitch, so the centre-to-centre gap
     across a class boundary is the MEAN of the two pitches — which is
     what a real cabin does where a 61 in row meets a 32 in one. */
  const rows = [];
  let x = xCabin - seatedLengthM / 2;
  for (const b of blocks) {
    let left = b.n;
    for (let i = 0; i < b.nRows; i++) {
      const seats = Math.min(b.abreast, left);
      left -= seats;
      rows.push({ cls: b.cls, seats, pitchM: b.pitchM, abreast: b.abreast,
                  x: x + b.pitchM / 2, index: rows.length });
      x += b.pitchM;
    }
  }

  return {
    available: true, nPax, nCarried: passengersCarried(type, inputs, nPax), abreast, blocks, rows,
    seatedLengthM, cabinLengthM: lCabin,
    /* THE SEATS DO NOT ALWAYS FIT THE SHELL THE DRAWING PLACES, and that
       is a finding, not something to absorb. fuselage-structure.js sets
       both bulkhead stations from the general arrangement's nose and
       tail-cone lengths and declares them drawing conventions in its own
       `boundaryWhy`: "A cabin layout (flight deck + cabin + baggage) is
       what makes them computed quantities." Seat pitch IS sourced. So
       where the two disagree the sourced quantity is kept and the
       convention is reported as the thing that has to move. */
    fitsCabin: seatedLengthM <= lCabin + 1e-9,
    overflowM: Math.max(0, seatedLengthM - lCabin),
    pitchSource: SEAT_PITCH_SOURCE, abreastBySource: ABREAST_SOURCE,
    abreastSource: `Scholz Ch.6 eq. (6.1), n_SA = 0.45*sqrt(${nPax}) = ${(0.45 * Math.sqrt(nPax)).toFixed(2)}`
      + (Math.round(0.45 * Math.sqrt(nPax)) < ABREAST_FLOOR
        ? `, raised to the floor of ${ABREAST_FLOOR}: the correlation is fitted to airliners and returns less `
          + "than a pair of seats on a cabin this small, which is not a layout"
        : ""),
  };
}

/* ── the wing box, as a tank ──────────────────────────────────────────
   The sealed tank is the box between the spars (FAA AMT Handbook, via
   STRUCTURAL-LAYOUT.md line 376). At spanwise station y the box runs
   from x_LE(y) + front*c(y) to x_LE(y) + rear*c(y), so its longitudinal
   centroid is x_LE(y) + ((front+rear)/2)*c(y) and its cross-sectional
   area goes as c(y)^2 (chordwise width times thickness, both linear in
   chord). The shape factor common to every station CANCELS in the
   centroid, so the tank station does not depend on it. */
function boxCentroid({ y1, y2, xRootLE, rootChord, tipChord, semiSpan, tanLeSweep, front, rear }) {
  const mid = (front + rear) / 2;
  const chordAt = (y) => rootChord + (tipChord - rootChord) * (y / semiSpan);
  const leAt = (y) => xRootLE + y * tanLeSweep;
  /* Simpson over the interval: the integrand is a cubic in y at worst
     (x_LE linear, c^2 quadratic, their product cubic), and Simpson is
     exact for cubics, so this is not an approximation. */
  const f = (y) => (leAt(y) + mid * chordAt(y)) * chordAt(y) ** 2;
  const g = (y) => chordAt(y) ** 2;
  const simpson = (fn) => ((y2 - y1) / 6) * (fn(y1) + 4 * fn((y1 + y2) / 2) + fn(y2));
  const num = simpson(f), den = simpson(g);
  return { x: den > 0 ? num / den : leAt((y1 + y2) / 2) + mid * chordAt((y1 + y2) / 2), volumeShare: den };
}

/* ── the fuel tanks ───────────────────────────────────────────────────
   The tool's own fuel capacity is FLOPS Eq 70-71 as Aviary implements it
   (`fuel_capacity.py` L143-158): the whole wing's volume estimate times
   `wingFuelFraction`, default 0.7752 from the Aviary LSA2 deck, plus
   `fuselageFuelLb` for anything carried outside the wing. That capacity
   is a FULL-SPAN figure, so the tank modelled here is the full-span box
   and no tank extent is invented. INDUSTRY-AUDIT.md T14 records the
   check: 737-800 -> 46,030 lb against 46,063 lb in the ACAPS.

   The split into three tanks is a CONVENTION and is labelled one. It
   exists so GASP's "all fuel tanks forward of FCGLIM" has something to
   bite on, and `splitSensitivityM` measures what the choice is worth. */
export function fuelTanks({ type, xWingRootLE, rootChord, tipChord, span, tanLeSweep,
                            fuselageWidthM, wingFuelKg, fuselageFuelKg }) {
  const spars = SPARS_BY_CLASS[type] ?? SPARS_BY_CLASS.transport;
  const semiSpan = span / 2;
  const yBody = Math.min(fuselageWidthM / 2, semiSpan * 0.99);
  const geom = { xRootLE: xWingRootLE, rootChord, tipChord, semiSpan, tanLeSweep,
                 front: spars.front, rear: spars.rear };

  const segs = [
    { id: "centre",   label: "Centre section", y1: 0, y2: yBody },
    { id: "inboard",  label: "Inboard wing",   y1: yBody, y2: (yBody + semiSpan) / 2 },
    { id: "outboard", label: "Outboard wing",  y1: (yBody + semiSpan) / 2, y2: semiSpan },
  ].map((s) => ({ ...s, ...boxCentroid({ ...geom, y1: s.y1, y2: s.y2 }) }));

  const totalShare = segs.reduce((t, s) => t + s.volumeShare, 0);
  const tanks = segs.map((s) => ({
    id: s.id, label: s.label, x: s.x,
    y1: s.y1, y2: s.y2,
    capacityKg: totalShare > 0 ? wingFuelKg * (s.volumeShare / totalShare) : 0,
  }));
  /* Fuel carried outside the wing rides with the centre section. */
  if (fuselageFuelKg > 0) tanks[0].capacityKg += fuselageFuelKg;

  /* The whole-tank centroid, which is NOT a convention: it is the box
     centroid over the full span and is what the split must reproduce. */
  const whole = boxCentroid({ ...geom, y1: 0, y2: semiSpan });
  const splitWeighted = tanks.reduce((t, k) => t + k.capacityKg * k.x, 0)
                      / Math.max(1e-9, tanks.reduce((t, k) => t + k.capacityKg, 0));

  return {
    tanks, wholeTankX: whole.x,
    /* If the three-tank split reproduces the single-tank centroid, the
       convention costs nothing when the tanks are full, and only orders
       the PARTIAL fills. That is the honest statement of its weight. */
    splitSensitivityM: splitWeighted - whole.x,
    spars,
    sparNote: spars.sourced
      ? `Spars at ${spars.front} c and ${spars.rear} c. ${spars.source}`
      : `Spars at ${spars.front} c and ${spars.rear} c, and THESE ARE NOT SOURCED: ${spars.source}. `
        + "The tank station inherits that, so read it as a layout sketch rather than a measurement.",
  };
}

/* ── the cargo holds ──────────────────────────────────────────────────
   Below-floor holds fore and aft of the wing box, filling the room the
   pressure shell leaves, then scaled together to Scholz's k_CARGO
   fraction of fuselage length. */
export function cargoHolds({ shellFwd, shellAft, boxFwd, boxAft, fuselageLengthM }) {
  const fwdRoom = Math.max(0, boxFwd - shellFwd);
  const aftRoom = Math.max(0, shellAft - boxAft);
  const room = fwdRoom + aftRoom;
  if (!(room > 0)) return { available: false, why: "the wing box fills the pressure shell, leaving no hold" };

  const target = HOLD.kHoldLength * fuselageLengthM;
  const scale = room > 0 ? Math.min(1, target / room) : 0;
  const fwdLen = fwdRoom * scale, aftLen = aftRoom * scale;

  /* Each hold is centred in its own room, so scaling shortens it about
     its own centre rather than sliding it to a bulkhead. */
  const holds = [];
  if (fwdLen > 0) holds.push({ id: "fwd", label: "Forward hold", lengthM: fwdLen,
                               x: shellFwd + fwdRoom / 2, fwd: true });
  if (aftLen > 0) holds.push({ id: "aft", label: "Aft hold", lengthM: aftLen,
                               x: boxAft + aftRoom / 2, fwd: false });
  return {
    available: true, holds, roomM: room, targetM: target, scale,
    note: `Holds fill the ${room.toFixed(1)} m the shell leaves fore and aft of the wing box, scaled to `
        + `Scholz's k_CARGO x l_F = ${HOLD.kHoldLength} x ${fuselageLengthM.toFixed(1)} = ${target.toFixed(1)} m. `
        + HOLD.kSource + ".",
  };
}

/* ── the diagram ──────────────────────────────────────────────────────
   Everything above is stations. This is the loading. */
export function loadingDiagram(ctx) {
  const {
    type, inputs, mOEW, xCgOew, mac, xLemac, xCabin, lCabin, fuselageLengthM,
    xWingRootLE, rootChord, tipChord, span, tanLeSweep, fuselageWidthM,
    shellFwd, shellAft, payloadKg, fuelKg, fuelCapacityKg,
  } = ctx;

  const pctMac = (x) => (x - xLemac) / mac;
  const caveats = [];

  const seats = seatGrid({ type, inputs, xCabin, lCabin });
  if (!seats.available) return { available: false, why: seats.why };

  /* ── the payload decomposition, checked against the sized payload ──
     massPerPassenger + baggagePerPassenger per seat, plus a separate
     cargo mass. On all four classes this reproduces `payloadKg` to the
     kilogram, and if it ever stops doing so the diagram is loading a
     different aeroplane from the one the tool sized. That is worth
     knowing, so it is reported rather than silently rescaled. */
  const p = inputs ?? {};
  const perPaxKg = (p.massPerPassenger ?? p.massPerOccupantLb ?? 200) * LB;
  const bagPerPaxKg = (p.baggagePerPassenger ?? 0) * LB;
  const cargoKg = (p.cargo ?? 0) * LB;
  /* The design payload is built from the passengers CARRIED. The seats
     installed set the geometry and the reach of GASP's extremes. */
  const paxKgTotal = seats.nCarried * perPaxKg;
  const bagKgTotal = seats.nCarried * bagPerPaxKg;
  const builtPayloadKg = paxKgTotal + bagKgTotal + cargoKg;
  const payloadCloses = Math.abs(builtPayloadKg - payloadKg) < 1e-6 * Math.max(1, payloadKg);
  if (!payloadCloses) {
    caveats.push(
      `The payload this diagram loads (${builtPayloadKg.toFixed(0)} kg: ${seats.nCarried} passengers at `
      + `${perPaxKg.toFixed(0)} kg, baggage at ${bagPerPaxKg.toFixed(0)} kg each, ${cargoKg.toFixed(0)} kg of `
      + `cargo) does not equal the sized payload of ${payloadKg.toFixed(0)} kg. The diagram is loading a `
      + "different aeroplane from the one the rest of the tool sized, and the difference is not absorbed here.");
  }

  /* ── stations ─────────────────────────────────────────────────────── */
  const spars = SPARS_BY_CLASS[type] ?? SPARS_BY_CLASS.transport;
  const boxFwd = xWingRootLE + spars.front * rootChord;
  const boxAft = xWingRootLE + spars.rear * rootChord;

  const fuel = fuelTanks({
    type, xWingRootLE, rootChord, tipChord, span, tanLeSweep, fuselageWidthM,
    wingFuelKg: Math.max(0, fuelCapacityKg - (p.fuselageFuelLb ?? 0) * LB),
    fuselageFuelKg: (p.fuselageFuelLb ?? 0) * LB,
  });

  const holdSet = cargoHolds({ shellFwd, shellAft, boxFwd, boxAft, fuselageLengthM });

  /* Baggage and cargo share the holds, split between them by hold
     length. With no hold at all — the trainer has no pressure shell and
     no below-floor volume — baggage rides at the cabin centroid, which
     is declared rather than dropped. */
  const holdMassKg = bagKgTotal + cargoKg;
  const holds = holdSet.available ? holdSet.holds : [];
  const holdLenTotal = holds.reduce((t, h) => t + h.lengthM, 0);
  const holdItems = holds.length
    ? holds.map((h) => ({ ...h, massKg: holdMassKg * (h.lengthM / holdLenTotal) }))
    : (holdMassKg > 0
        ? [{ id: "cabin", label: "Baggage at the cabin centroid", x: xCabin, lengthM: 0, fwd: true,
             massKg: holdMassKg, improvised: true }]
        : []);
  if (!holdSet.available && holdMassKg > 0) {
    caveats.push(
      `${holdMassKg.toFixed(0)} kg of baggage and cargo is carried at the cabin centroid because ${holdSet.why}. `
      + "A station that is not a hold is a convention; this one contributes no CG travel at all, which makes the "
      + "range below optimistic rather than conservative.");
  }

  /* ── the load items, each a mass at a station ─────────────────────── */
  const seatItems = seats.rows.map((r) => ({
    kind: "pax", label: `Row ${r.index + 1} (${r.cls})`, x: r.x,
    massKg: r.seats * perPaxKg, seats: r.seats, cls: r.cls,
  }));
  const holdLoad = holdItems.map((h) => ({ kind: "hold", label: h.label, x: h.x, massKg: h.massKg }));

  /* The passengers actually CARRIED, seated forward — GASP V.1.3.5 step
     2, "Passengers are loaded in forward seats". These are who board
     along Scholz's curves; `seatItems` above is every installed seat,
     which is what GASP's extremes are allowed to fill. */
  const designSeatItems = (() => {
    let left = seats.nCarried;
    const out = [];
    for (const r of [...seats.rows].sort((a, b) => a.x - b.x)) {
      const take = Math.min(r.seats, left);
      left -= take;
      if (take > 0) out.push({ kind: "pax", label: `Row ${r.index + 1} (${r.cls})`, x: r.x,
                               massKg: take * perPaxKg, seats: take, cls: r.cls });
      if (left <= 0) break;
    }
    return out;
  })();
  const fuelLoad = fuel.tanks.map((t) => ({ kind: "fuel", label: t.label, x: t.x, massKg: 0, capacityKg: t.capacityKg }));

  /* Fuel actually carried, filled into the tanks in their own order.
     `fuelKg` is the mission fuel, which is less than capacity. */
  const fillTanks = (order) => {
    let left = fuelKg;
    const out = [];
    for (const t of order) {
      const take = Math.min(left, t.capacityKg);
      left -= take;
      if (take > 0) out.push({ kind: "fuel", label: t.label, x: t.x, massKg: take });
    }
    return { items: out, unfilledKg: left };
  };
  const tanksFwdFirst = [...fuel.tanks].sort((a, b) => a.x - b.x);
  const tanksAftFirst = [...fuel.tanks].sort((a, b) => b.x - a.x);

  /* ── a path: accumulate mass and moment, emitting a point per step ── */
  const walk = (steps) => {
    let m = mOEW, mx = mOEW * xCgOew;
    const path = [{ label: "Operating empty", massKg: m, x: xCgOew, pctMac: pctMac(xCgOew) }];
    for (const s of steps) {
      if (!(s.massKg > 0)) continue;
      m += s.massKg; mx += s.massKg * s.x;
      path.push({ label: s.label, kind: s.kind, massKg: m, x: mx / m, pctMac: pctMac(mx / m) });
    }
    return path;
  };

  /* ── Scholz's six orders, each in both fill directions ─────────────
     "If the normal loading sequence is, for example: 1. Passengers,
      2. Cargo, 3. Fuel, then the following sequences must also be
      checked for their influence: 1-3-2, 2-1-3, 2-3-1, 3-1-2, 3-2-1."
     Within a group the fill direction is the second branch, and for the
     passengers it is exactly the window-seat lobe pair: front window
     seats first gives the left curve, rear window seats first the right. */
  /* BOARDING CHOOSES SEATS OUT OF THE WHOLE CABIN, not out of a block
     someone else picked. Scholz's branches are about which seats fill
     first — "It is assumed that passengers will occupy the window seats
     (A -> C) first" — so with four passengers in a nine-seat cabin the
     front-first branch seats them in the front rows and the rear-first
     branch seats them in the BACK rows. Selecting the forward block and
     then sorting it backwards, which is what this did at first, gave the
     business jet a cabin whose passengers could never sit aft of row two. */
  const boardIn = (dir) => {
    let left = seats.nCarried;
    const out = [];
    for (const r of [...seats.rows].sort((a, b) => (dir === "fwd" ? a.x - b.x : b.x - a.x))) {
      const take = Math.min(r.seats, left);
      left -= take;
      if (take > 0) out.push({ kind: "pax", label: `Row ${r.index + 1} (${r.cls})`, x: r.x,
                               massKg: take * perPaxKg, seats: take, cls: r.cls });
      if (left <= 0) break;
    }
    return out;
  };

  const groupsFor = (dir) => {
    const paxSorted = boardIn(dir);
    const holdSorted = [...holdLoad].sort((a, b) => (dir === "fwd" ? a.x - b.x : b.x - a.x));
    const filled = fillTanks(dir === "fwd" ? tanksFwdFirst : tanksAftFirst);
    return { P: paxSorted, C: holdSorted, F: filled.items, unfilledKg: filled.unfilledKg };
  };

  const ORDERS = [["P", "C", "F"], ["P", "F", "C"], ["C", "P", "F"],
                  ["C", "F", "P"], ["F", "P", "C"], ["F", "C", "P"]];
  const NAMES = { P: "Passengers", C: "Cargo and baggage", F: "Fuel" };

  const paths = [];
  for (const dir of ["fwd", "aft"]) {
    const g = groupsFor(dir);
    for (const order of ORDERS) {
      paths.push({
        order: order.map((k) => NAMES[k]).join(" -> "),
        orderKey: order.join("-"),
        direction: dir === "fwd" ? "filled from the front" : "filled from the back",
        path: walk(order.flatMap((k) => g[k])),
      });
    }
  }

  /* The two lobes, named as Scholz names them, for the plot. */
  const gF = groupsFor("fwd"), gA = groupsFor("aft");
  const boarding = {
    frontWindowFirst: walk(gF.P),
    rearWindowFirst: walk(gA.P),
    note: "Scholz Ch.10 p.10-22: the passengers-only branches. \"If the rear window seats are filled first, "
        + "the weight and center of gravity migrate upwards via the right curve in the diagram ... If the front "
        + "window seats are filled first, the left curve is followed.\" These two are the lobes of the potato.",
  };
  const unfilledKg = gF.unfilledKg;
  if (unfilledKg > 1) {
    caveats.push(
      `${unfilledKg.toFixed(0)} kg of the mission fuel does not fit the tanks this module models. The wing `
      + "volume, the usable fraction and the mission fuel are three independent numbers and nothing forces them "
      + "to agree; the overflow is reported rather than poured into a tank that is not there.");
  }

  /* ── GASP's five named conditions ─────────────────────────────────── */
  const limits = { ...(CG_LIMITS_BY_CLASS[type] ?? CG_LIMITS_BY_CLASS.transport), ...(ctx.cgLimits ?? {}) };
  const gasp = gaspConditions({
    seatItems, designSeatItems, holdLoad, fuel, fuelKg, fuelCapacityKg,
    pctMac, xOf: (frac) => xLemac + frac * mac, walk, limits,
  });

  /* ── the envelope, over everything ────────────────────────────────── */
  const allPoints = [
    ...paths.flatMap((p) => p.path),
    ...boarding.frontWindowFirst, ...boarding.rearWindowFirst,
    ...gasp.conditions.filter((c) => c.available).map((c) => ({ label: c.label, massKg: c.massKg, x: c.x, pctMac: c.pctMac })),
  ].filter((q) => Number.isFinite(q.pctMac));

  const fwd = allPoints.reduce((a, q) => (q.pctMac < a.pctMac ? q : a), allPoints[0]);
  const aft = allPoints.reduce((a, q) => (q.pctMac > a.pctMac ? q : a), allPoints[0]);

  /* The boarding envelope on its own — Scholz's orders and lobes, with no
     GASP extreme in it. This is the aeroplane being loaded as specified;
     the GASP pair is the aeroplane being loaded adversarially. Reporting
     one number for both would hide which question was asked. */
  const pathPoints = [...paths.flatMap((q) => q.path), ...boarding.frontWindowFirst,
                      ...boarding.rearWindowFirst].filter((q) => Number.isFinite(q.pctMac));
  const pathFwd = pathPoints.reduce((a, q) => (q.pctMac < a.pctMac ? q : a), pathPoints[0]);
  const pathAft = pathPoints.reduce((a, q) => (q.pctMac > a.pctMac ? q : a), pathPoints[0]);

  /* ── DELXCG, which is what the downstream packages actually want ────
     BALANCE-AND-TAIL.md line 264, on the GASP FORTRAN: "DELXCG — the
     required CG travel in MAC fractions — is the input to tail sizing,
     and the wing is slid fore/aft (ELWING) to make the forward loaded CG
     land on the forward limit."

         DELXCG = (ELCGD(1) - ELCGD(2))/CBARW
         ELWING = ELCGD(2) + (CPMRGN + .25 - XCGFWD)*CBARW

     ELCGD(2) is the forward loaded CG and ELCGD(1) the aft one, so the
     first line is computable here and the second says how far the wing
     would have to move. That second number is the finding this module
     turns up: balance.js places the wing to put the OPERATING EMPTY CG
     at `targetCgPctMac`, and GASP places it to put the FORWARD LOADED CG
     on the forward limit. Those are different criteria, which is why a
     tool balanced to 25 % MAC empty can still load outside a published
     envelope. B3 does not move the wing — that is B2's placement and
     B5's loop — it supplies the quantity the move needs. */
  const gFwd = gasp.conditions.find((c) => c.id === "V.1.3.3");
  const gAft = gasp.conditions.find((c) => c.id === "V.1.3.4");
  const cgTravel = {
    delxcg: (gAft.x - gFwd.x) / mac,
    fwdLoadedX: gFwd.x, aftLoadedX: gAft.x,
    fwdLoadedPctMac: gFwd.pctMac, aftLoadedPctMac: gAft.pctMac,
    /* One step, not a solution: sliding the wing moves x_LEMAC, which
       moves FCGLIM and the wing-group masses with it, so this is the
       first Newton step of GASP's loop and is labelled as one. */
    wingShiftForFwdLimitM: gasp.fcglim - gFwd.x,
    note: "DELXCG is GASP's required CG travel in MAC fractions and is the input to tail sizing (Vol. V, and "
        + "BALANCE-AND-TAIL.md line 264). `wingShiftForFwdLimitM` is how far aft the wing would have to slide "
        + "for the forward loaded CG to land on FCGLIM, as ELWING = ELCGD(2) + (CPMRGN + .25 - XCGFWD)*CBARW "
        + "asks — ONE step, because moving the wing moves x_LEMAC, FCGLIM and the wing-group stations with it. "
        + "balance.js places the wing on a different criterion: it puts the OPERATING EMPTY CG at the target, "
        + "not the forward LOADED CG on the forward limit. That difference is why an aeroplane balanced to "
        + "25 % MAC empty can still load outside a published envelope, and closing it is B2's and B5's work.",
  };

  if (!seats.fitsCabin) {
    caveats.push(
      `The seats need ${seats.seatedLengthM.toFixed(1)} m of cabin at the sourced pitch and the pressure shell `
      + `as drawn is ${lCabin.toFixed(1)} m, ${seats.overflowM.toFixed(1)} m short. The pitch is sourced and the `
      + "shell stations are not — fuselage-structure.js calls both bulkheads drawing conventions in its own "
      + "boundaryWhy and says a cabin layout is what would make them computed. So the seats are placed at the "
      + "sourced pitch and this aeroplane's shell is the thing that has to move.");
  }
  if (!spars.sourced) {
    caveats.push(
      `The wing box spars on this class are not sourced (${spars.source}), so every fuel station below inherits `
      + "an assumption. On a class whose fuel is a large fraction of the take-off mass that is the dominant "
      + "uncertainty in the aft limit.");
  }
  if (gFwd.verdict !== "complies" || gAft.verdict !== "complies") {
    caveats.push(
      `GASP's loading rules put this aeroplane outside the envelope they were run against: forward load at `
      + `${(100 * gFwd.pctMac).toFixed(1)} % MAC against a ${(100 * limits.fwd).toFixed(1)} % limit, aft load at `
      + `${(100 * gAft.pctMac).toFixed(1)} % against ${(100 * limits.aft).toFixed(1)} %. That is a CRITERION `
      + "MISMATCH, not a defect in the diagram. balance.js places the wing so the OPERATING EMPTY CG sits at its "
      + "target; GASP places it so the FORWARD LOADED CG sits on the forward limit. The wing would have to move "
      + `${(gasp.fcglim - gFwd.x).toFixed(2)} m to satisfy GASP's criterion, and the required CG travel DELXCG `
      + `is ${(100 * cgTravel.delxcg).toFixed(1)} % MAC — which is the number tail sizing wants. Moving the wing `
      + "on that criterion is B2 and B5, not this module.");
  }
  if (seats.nCarried < seats.nPax) {
    caveats.push(
      `This cabin has ${seats.nPax} seats and sells ${seats.nCarried}, and that WIDENS the centre-of-gravity `
      + "range rather than narrowing it. TASOPT's analytic sweep cannot show the effect: in "
      + "x_pay = x_cabin + l_cabin*(xi_pay - 1/2)*(1 - r_pay) the load fraction r_pay is both how much payload "
      + "is aboard and, through (1 - r_pay), how long the lever is. Those are the same thing only when every "
      + "seat is sold. Here a FULL passenger load can sit in the forward rows — the longest lever at the "
      + "heaviest load — which is a real loading the continuum has no way to express.");
  }
  caveats.push(
    "GASP's rules each begin \"1. pilot\". Every class here except the trainer already carries its flight and "
    + "cabin crew inside the operating empty weight, with stations balance.js assigned, so the pilot step is NOT "
    + "repeated — it would count the crew twice. The trainer's payload is (pax + 1) x massPerOccupant, so there "
    + "the pilot is seated as payload.");
  caveats.push(
    `The rules are GASP's; the masses are this tool's. GASP loads ${GASP_FIGURES.paxMassExtremesLb} lb per `
    + `passenger for the CG extremes and ${GASP_FIGURES.paxMassDesignLb} lb for the design case, while this `
    + `diagram uses the FLOPS inputs the aeroplane was sized with (${(perPaxKg / LB).toFixed(0)} lb per `
    + `passenger plus ${(bagPerPaxKg / LB).toFixed(0)} lb of baggage). Substituting GASP's figure would put the `
    + "diagram's gross weight at odds with the sized aircraft.");
  caveats.push(
    "The three-tank split is a convention, not a layout. It exists so that GASP's \"all fuel tanks forward of "
    + `FCGLIM\" has something to select; the full-tank centroid it reproduces is off the single-tank centroid by `
    + `${(1e3 * fuel.splitSensitivityM).toFixed(1)} mm, so it changes nothing when the tanks are full and only `
    + "orders the partial fills.");

  return {
    available: true,
    seats, fuel, holds: holdItems, holdSet,
    payload: {
      perPaxKg, bagPerPaxKg, cargoKg, paxKgTotal, bagKgTotal,
      builtKg: builtPayloadKg, sizedKg: payloadKg, closes: payloadCloses,
    },
    boxFwd, boxAft,
    paths, boarding, gasp, cgTravel,
    envelope: {
      fwd, aft,
      fwdPctMac: fwd.pctMac, aftPctMac: aft.pctMac,
      rangePctMac: (aft.pctMac - fwd.pctMac) * 100,
      basis: "Every point this module computes: Scholz's six loading orders in both fill directions, the two "
           + "boarding lobes, and GASP's five named conditions. The widest of them.",
    },
    boardingEnvelope: {
      fwd: pathFwd, aft: pathAft,
      fwdPctMac: pathFwd.pctMac, aftPctMac: pathAft.pctMac,
      rangePctMac: (pathAft.pctMac - pathFwd.pctMac) * 100,
      basis: "Scholz's orders and lobes only — the aeroplane loaded as specified, with no GASP adversarial "
           + "condition in it. Narrower than the full envelope by construction.",
    },
    unfilledFuelKg: unfilledKg,
    caveats,
  };
}

/* ── GASP sections V.1.3.3 to V.1.3.7 ────────────────────────────────
   FCGLIM and ACGLIM are the input CG limits XCGFWD/XCGAFT expressed as
   absolute stations — see the header, point 3. The loading is computed
   against them and the question the conditions answer is whether the
   result COMPLIES, not where the limit is. */
function gaspConditions({ seatItems, designSeatItems, holdLoad, fuel, fuelKg, fuelCapacityKg,
                          pctMac, xOf, walk, limits }) {
  /* Fill every tank that lies on the chosen side of the limit, then top
     up toward minimum fuel from the next tank on that side — GASP steps
     4 and 5, in that order. */
  const minFuelKg = GASP_FIGURES.minFuelTurbineFracOfWingCapacity * fuelCapacityKg;
  const fcglim = xOf(limits.fwd), acglim = xOf(limits.aft);

  const sideLoad = (limitX, side) => {
    const keep = (q) => (side === "fwd" ? q.x <= limitX : q.x >= limitX);
    const pax = seatItems.filter(keep);
    const bags = holdLoad.filter(keep);
    const near = [...fuel.tanks].sort((a, b) => (side === "fwd" ? a.x - b.x : b.x - a.x));
    const onSide = near.filter(keep);
    let f = onSide.reduce((t, k) => t + k.capacityKg, 0);
    const fuelItems = onSide.map((k) => ({ kind: "fuel", label: k.label, x: k.x, massKg: k.capacityKg }));
    /* step 5: "add fuel to next most forward fuel tank until minimum
       fuel load is reached" */
    if (f < minFuelKg) {
      for (const k of near) {
        if (onSide.includes(k)) continue;
        const take = Math.min(k.capacityKg, minFuelKg - f);
        if (take <= 0) break;
        f += take;
        fuelItems.push({ kind: "fuel", label: `${k.label} (to minimum fuel)`, x: k.x, massKg: take });
        if (f >= minFuelKg - 1e-9) break;
      }
    }
    return { steps: [...pax, ...bags, ...fuelItems], nPax: pax.reduce((t, q) => t + q.seats, 0), fuelKg: f };
  };

  const run = (side, limitX) => {
    const s = sideLoad(limitX, side);
    const path = walk(s.steps);
    const end = path[path.length - 1];
    return { limitX, limitPctMac: pctMac(limitX), path, end, nPaxLoaded: s.nPax, fuelLoadedKg: s.fuelKg };
  };
  const fwd = run("fwd", fcglim);
  const aft = run("aft", acglim);

  /* Does the loading the rule produces stay inside the limit it was
     loaded against? Forward-loading must not go forward of FCGLIM; aft
     must not go aft of ACGLIM. This is the whole point of the pair of
     conditions, and it is a real question with a real answer, unlike the
     fixed point the first version of this module computed. */
  const verdictOf = (c, side) => (side === "fwd"
    ? (c.end.x >= c.limitX ? "complies" : "exceeds the forward limit")
    : (c.end.x <= c.limitX ? "complies" : "exceeds the aft limit"));

  /* V.1.3.5 Design load: GASP derives the passenger count from the
     payload at 200 lb a head and calls the remainder baggage, and loads
     them in FORWARD seats ("Passengers are loaded in forward seats").
     This tool is given the split directly, so the design condition here
     is the aeroplane as specified and GASP's derived count is reported
     beside it so the two can be compared rather than conflated. */
  const fillFwd = (kg) => {
    let left = kg; const out = [];
    for (const t of [...fuel.tanks].sort((a, b) => a.x - b.x)) {
      const take = Math.min(left, t.capacityKg); left -= take;
      if (take > 0) out.push({ kind: "fuel", label: t.label, x: t.x, massKg: take });
    }
    return out;
  };
  const designSteps = [...designSeatItems, ...holdLoad, ...fillFwd(fuelKg)];
  const designPath = walk(designSteps);
  const designEnd = designPath[designPath.length - 1];
  const wplLb = (designSeatItems.reduce((t, s) => t + s.massKg, 0)
               + holdLoad.reduce((t, h) => t + h.massKg, 0)) / LB;
  const gaspDerivedPax = Math.floor(wplLb / GASP_FIGURES.paxMassDesignLb);

  /* V.1.3.6 Minimum fuel for weight and balance. Turbine rule only: the
     piston rule is maximum installed horsepower / 2, and no class here
     reports an installed horsepower that GASP's rule was written for, so
     it is declared rather than approximated. */
  const minFuelSteps = [...designSeatItems, ...holdLoad, ...fillFwd(minFuelKg)];
  const minFuelPath = walk(minFuelSteps);
  const minFuelEnd = minFuelPath[minFuelPath.length - 1];

  /* V.1.3.7 Maximum baggage: "Maximum baggage is assumed to be same as
     design load baggage". With the design baggage already aboard in the
     design condition, the distinguishing case here is maximum baggage
     with the cabin empty, which is the aft-loading case for a hold that
     sits aft of the wing box. */
  const maxBagSteps = [...holdLoad];
  const maxBagPath = walk(maxBagSteps);
  const maxBagEnd = maxBagPath[maxBagPath.length - 1];

  const conditions = [
    { id: "V.1.3.3", label: "Most forward load", available: true,
      massKg: fwd.end.massKg, x: fwd.end.x, pctMac: fwd.end.pctMac,
      limitX: fwd.limitX, limitPctMac: fwd.limitPctMac, verdict: verdictOf(fwd, "fwd"),
      nPaxLoaded: fwd.nPaxLoaded, fuelLoadedKg: fwd.fuelLoadedKg, path: fwd.path,
      rule: "Seats and baggage forward of FCGLIM, tanks forward of FCGLIM full, topped to minimum fuel" },
    { id: "V.1.3.4", label: "Most aft load", available: true,
      massKg: aft.end.massKg, x: aft.end.x, pctMac: aft.end.pctMac,
      limitX: aft.limitX, limitPctMac: aft.limitPctMac, verdict: verdictOf(aft, "aft"),
      nPaxLoaded: aft.nPaxLoaded, fuelLoadedKg: aft.fuelLoadedKg, path: aft.path,
      rule: "Seats and baggage aft of ACGLIM, tanks aft of ACGLIM full, topped to minimum fuel" },
    { id: "V.1.3.5", label: "Design load", available: true,
      massKg: designEnd.massKg, x: designEnd.x, pctMac: designEnd.pctMac, path: designPath,
      rule: "Every seat filled, holds loaded, mission fuel aboard",
      gaspDerivedPax, specifiedPax: seatItems.reduce((t, s) => t + s.seats, 0),
      derivationNote: `GASP takes the passenger count as the largest whole number in WPL/200 = `
        + `${wplLb.toFixed(0)}/200 = ${gaspDerivedPax}, and calls the remainder baggage. This tool is given the `
        + `split directly (${designSeatItems.reduce((t, s) => t + s.seats, 0)} passengers plus a separate cargo `
        + "mass), so the specified split is used and GASP's derived count is reported beside it, not instead of it." },
    { id: "V.1.3.6", label: "Minimum fuel for weight and balance", available: true,
      massKg: minFuelEnd.massKg, x: minFuelEnd.x, pctMac: minFuelEnd.pctMac, path: minFuelPath,
      minFuelKg,
      rule: `Turbine rule: ${GASP_FIGURES.minFuelTurbineFracOfWingCapacity * 100} % of wing tank capacity `
        + `= ${minFuelKg.toFixed(0)} kg. GASP: "Turbine Aircraft. Specified by Manufacturer (no general rule). `
        + "The program currently assumes 20 % of wing fuel tank capacity\". The piston rule (installed "
        + "horsepower / 2) is not applied: no class here reports the installed horsepower it was written for.",
      footnote: "GASP's own footnote: \"Min fuel for wt. and balance is not necessarily the same as minimum "
        + "fuel for flight. See FAA Advisory Circular AC65-9, p. 50-51.\"" },
    { id: "V.1.3.7", label: "Maximum baggage, cabin empty",
      available: holdLoad.reduce((t, h) => t + h.massKg, 0) > 0,
      massKg: maxBagEnd.massKg, x: maxBagEnd.x, pctMac: maxBagEnd.pctMac, path: maxBagPath,
      why: holdLoad.reduce((t, h) => t + h.massKg, 0) > 0 ? ""
        : "this aeroplane carries no baggage or cargo mass at all, so there is no maximum-baggage case to "
          + "distinguish; the condition is not evaluated rather than reported as the empty aeroplane",
      rule: "\"Maximum baggage is assumed to be same as design load baggage\", carried with the cabin empty" },
  ];

  return {
    conditions, minFuelKg, limits,
    fcglim, acglim,
    limitNote: `FCGLIM and ACGLIM are the input limits XCGFWD = ${(100 * limits.fwd).toFixed(1)} % and XCGAFT = `
      + `${(100 * limits.aft).toFixed(1)} % MAC expressed as stations, per the GASP FORTRAN "FCGLIM = ELWING - `
      + `(CPMRGN + .25 - XCGFWD)*CBARW". They come from ${limits.from}. GASP's own loop closes the circle by `
      + "moving the WING and resizing the TAIL until the forward loaded CG lands on FCGLIM (Vol. V section "
      + "V.1.3 steps 3-5); that needs a tail size and is B5, so here the loading is computed against the limit "
      + "and the output is whether it complies.",
  };
}
