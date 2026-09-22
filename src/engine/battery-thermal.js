/* =====================================================================
   BATTERY THERMAL MANAGEMENT (BTMS), BMS AND PACK INSTALLATION
   =====================================================================
   WHY THIS EXISTS

   The engine already computed the heat: `Pheat = I_hov^2 * R_int`, with
   R_int = 0.030 * Ns/Np. At the default that is 108 kW — 12.8% of hover power.
   Nothing then rejected it, and nothing weighed the system that would have to.
   A pack that generates 108 kW of heat and carries no cooling mass is not a
   conservative model, it is an incomplete one.

   Three separate things are sized here, and they are frequently conflated:
     BTMS   the cooling loop that REJECTS the heat
     BMS    the electronics that MONITOR and balance the cells
     INSTALLATION  the structure that RETAINS the pack in a crash, which for an
            eVTOL is a certification-driven mass, not an afterthought

   ── THERMAL LIMITS ───────────────────────────────────────────────────
   Lithium cells for this duty run optimally at 25-45 C with a maximum
   threshold around 55 C; eVTOL packs operate at 3C-8C, which is high enough
   that cell temperature can pass 60 C within minutes if uncooled. The hover
   segment is the critical one: it is short but at the highest C-rate, so it is
   a TRANSIENT problem, not a steady-state one.

   Transient rise with cooling active, treating the pack as a lumped mass:

       dT/dt = (Q_gen - Q_rej) / (m_pack * cp)

   integrated over the hover segment. Li-ion specific heat is about
   1000-1100 J/(kg K); 1050 is used.

   ── COOLING SYSTEM MASS ──────────────────────────────────────────────
   Published eVTOL liquid-cooling studies report that a system able to hold the
   pack within limits masses LESS THAN 20% OF THE PACK, with specific designs
   quoted at 46 kg (holding the battery below 49.5 C) and 65-80 kg for tighter
   control. Those anchor the specific mass used here, and the 20% figure is
   enforced as an upper sanity bound so the model cannot silently produce an
   absurd cooling system.

   ── PACK INSTALLATION — THIS IS A REGULATORY MASS ────────────────────
   EASA MOC SC-VTOL Issue 2, MOC VTOL.2325(a)(4), "Energy storage system load
   factors", gives ULTIMATE inertial load factors for retaining the contents,
   and they are severe:

     "(b) For energy storage systems in the cabin:
          Upward - 4 g. Forward - 16 g. (18 g for CTOL) Sideward - 8 g.
          Downward - 20 g. Rearward - 1.5 g."
     "(c) For energy storage systems located above or adjacent the crew or
      passenger compartment ...:
          Upward - 1.5 g. Forward - 12 g. Sideward - 6 g. Downward - 12 g."
     "(d) For energy storage systems in other areas:
          Upward - 1.5 g. Forward - 4 g. Sideward - 2 g. Downward - 4 g."

   A cabin-mounted pack must therefore be restrained against 20 g downward and
   16 g forward, against 4 g / 4 g if it sits elsewhere — a factor of five in
   the mount loads purely from WHERE the pack is put.

   THIS PARAGRAPH USED TO END "a real design decision the tool can now show",
   and validation/battery-thermal.mjs showed on its first run that it does not,
   at any pack an aircraft of this class carries. The tray moment reduces
   exactly:

       M = 0.048 w L^2,  w = n m g / A,  L^2 = A   =>   M = 0.048 n m g

   the footprint cancels, face thickness depends on n*m alone, and the 0.5 mm
   minimum gauge governs below it. Measured: the cabin case (20 g) only leaves
   minimum gauge above a 929 kg pack, and "other" (4 g) would need 4,647 kg.
   So at 900 kg all three locations return the same 7.71 kg of mounts.

   Minimum gauge is a real constraint, so this is a physical result and not a
   coding error — but the five-fold decision is DORMANT, not demonstrated, and
   the gate now asserts non-decreasing always and strictly-increasing only in
   the load-governed regime. Say what the tool does, not what it nearly does.

   ── THERMAL RUNAWAY — TWO COMPLIANCE PATHS, NOT ONE ──────────────────

   Added 2026-08-26 after auditing the MOC publications we had never fetched.
   MOC-3 SC-VTOL Issue 2 (21 June 2023) carries **MOC VTOL.2440 Propulsion
   Batteries Thermal Runaway for VTOL category enhanced**, which did not exist
   in the 2021 document this module was built from.

   It names RTCA DO-311A as the baseline, then says plainly that its
   containment test is the WRONG instrument for a propulsion pack:

     "That containment test, when applied to propulsion battery systems, may
      lead to decrease their energy/weight ratio UNDULY AND SUBSTANTIALLY,
      because of placing the focus on the containment of an unprecedented
      thermal runaway event instead of considering the implementation of
      different protection layers and the containment of a realistic worst-case
      thermal runaway event."

   and proposes an alternative "to promote best industry practices, robust
   designs, and protection layers strategies ... instead of relying only on
   containment mitigations."

   So there are two routes, and they carry very different mass:

     nonPropagation  prove a single-cell runaway does not propagate. Mass goes
                     into inter-cell and inter-module barriers and venting —
                     it scales with the number of MODULES, not with the size of
                     a box around the whole pack.
     containment     contain the event in a structural enclosure. Scales with
                     pack surface area. This is the DO-311A-style route and is
                     the heavier one, which is precisely what the MOC warns
                     about.

   The old model only knew containment, so it charged every design the heavy
   path. Default is now nonPropagation, because that is the strategy the
   regulator is steering the industry toward and the one a modern pack designs
   for. Set trStrategy:"containment" to size the conservative route.
   ===================================================================== */

import { G0 } from "./constants.js";

/* SC-VTOL VTOL.2325(a)(4) ultimate inertial load factors, by installation. */
export const PACK_LOAD_FACTORS = {
  cabin:    { up: 4.0, fwd: 16.0, side: 8.0, down: 20.0, aft: 1.5,
              label: "in the cabin" },
  adjacent: { up: 1.5, fwd: 12.0, side: 6.0, down: 12.0, aft: 1.5,
              label: "above or adjacent to the occupied compartment" },
  other:    { up: 1.5, fwd: 4.0,  side: 2.0, down: 4.0,  aft: 1.5,
              label: "in other areas" },
};

export const THERMAL_CONSTANTS = {
  cpCell:          1050,   // [SRC] J/(kg K), Li-ion pack lumped specific heat
  tCellMaxC:       55,     // [SRC] maximum cell threshold
  tCellOptMaxC:    45,     // [SRC] top of the optimal band
  tAmbientC:       35,     // [LAY] hot-day vertiport ambient
  btmsKgPerKW:     0.45,   // [CAL] anchored on the published 46 kg system
  btmsMaxFracPack: 0.20,   // [SRC] published bound: BTMS < 20% of pack mass
  bmsFracPack:     0.015,  // [CAL] monitoring, balancing, contactors
  bmsKgPerSeries:  0.055,  // [CAL] per series group (cell-group monitoring)
  mountMatRho:     1600,   // [SRC] CFRP faces
  mountMatSigma:   3.5e8,  // [SRC] Pa, working stress
  trayCoreThkM:    0.050,  // [LAY] tray sandwich core thickness
  trayCoreRho:     48,     // [SRC] Nomex 48 kg/m3
  trayMinFaceM:    0.0005, // [LAY] minimum face gauge
  packThicknessM:  0.30,   // [LAY] installed pack slab thickness
  trayNonOptimum:  1.35,   // [LAY] fittings, hardpoints, edge closeouts
  /* [LAY] BOTH of these, and the honest position is that NEITHER has published
     mass data behind it. MOC VTOL.2440 says containment penalises the
     energy/weight ratio "unduly and substantially" but gives no number, so all
     that can be encoded is the ORDERING and a plausible magnitude. Expressed as
     fractions of pack mass because that is the quantity they actually scale
     with — an earlier version mixed a per-module barrier mass with a per-area
     enclosure mass, and the two were so inconsistent that non-propagation came
     out HEAVIER than containment, inverting the point the MOC is making.
     Replace both the moment real numbers are available. */
  containmentFracPack:    0.060,  // [LAY] DO-311A-style structural enclosure
  nonPropagationFracPack: 0.030,  // [LAY] inter-module barriers, venting, isolation
  cellsPerModule:         120,    // [LAY] reported for module count only
  packDensityKgM3: 2100,   // [LAY] installed pack bulk density
};

/**
 * @param p parameter set
 * @param g { Wbat, PackkWh, Pheat, PheatCruise, Nseries, Ncells, tHoverS }
 */
export function batteryThermal(p, g, K = THERMAL_CONSTANTS) {
  const mPack = Math.max(1, g.Wbat);
  const Qhov  = Math.max(0, g.Pheat || 0);              // W, hover ohmic heat
  const Qcr   = Math.max(0, g.PheatCruise ?? Qhov * 0.1);

  /* ── COOLING CAPACITY ───────────────────────────────────────────────
     Sized on the SUSTAINED case (cruise), with the hover peak absorbed partly
     by the pack's own thermal mass. Sizing on the hover peak would give a
     cooling system that is never used at full capacity. */
  const Qreject = Math.max(Qcr, Qhov * (p.btmsHoverFraction ?? 0.55));
  let mBTMS = K.btmsKgPerKW * (Qreject / 1000);
  const btmsCapped = mBTMS > K.btmsMaxFracPack * mPack;
  if (btmsCapped) mBTMS = K.btmsMaxFracPack * mPack;

  /* ── TRANSIENT RISE THROUGH THE HOVER SEGMENT ───────────────────────
     dT = (Q_gen - Q_rej) * t / (m cp). Hover is short and hot, so the pack's
     own thermal mass does much of the work; this is what makes the segment
     survivable without a cooling system sized for the full 108 kW. */
  const tHover = g.tHoverS ?? 240;                       // both hover segments
  const dTHover = Math.max(0, (Qhov - Qreject)) * tHover / (mPack * K.cpCell);
  const tPeakC  = K.tAmbientC + dTHover;
  const withinMax = tPeakC <= K.tCellMaxC;
  const withinOpt = tPeakC <= K.tCellOptMaxC;

  /* Steady-state cruise balance — if rejection cannot match cruise generation
     the pack heats without bound over a long leg, which no thermal mass saves. */
  const cruiseBalanced = Qreject >= Qcr;

  /* ── BMS ────────────────────────────────────────────────────────────
     Two terms: a pack-proportional part (contactors, HV distribution, current
     sensing) and a per-series-group part, because monitoring and balancing
     hardware scales with the number of cell groups, not with mass. */
  const mBMS = K.bmsFracPack * mPack + K.bmsKgPerSeries * (g.Nseries || 100);

  /* ── INSTALLATION — SC-VTOL VTOL.2325(a)(4) ─────────────────────────
     A pack is carried on a TRAY working in BENDING, not on rods in tension. An
     earlier version idealised the mounts as pure tension members and returned
     0.5 kg to restrain a 1.4 tonne pack at 20 g — the same mistake the wing box
     made with its skin: an idealised load path is far lighter than a real
     structure, and pure axial is the most efficient path there is.

     Modelled as a sandwich tray carrying the pack's inertial load as a
     distributed pressure, simply supported at its edges:
         w   = n m g / A_footprint
         M   = 0.048 w L^2          (simply-supported plate, per unit width)
         t_f = M / (sigma h)        (sandwich faces about a core of depth h)
     The governing load factor is the largest of the six directions for the
     chosen installation — 20 g downward for a cabin pack, 4 g elsewhere. */
  const loc = PACK_LOAD_FACTORS[p.packLocation ?? "other"] ?? PACK_LOAD_FACTORS.other;
  const nGov = Math.max(loc.up, loc.fwd, loc.side, loc.down, loc.aft);

  const volPack   = mPack / K.packDensityKgM3;
  const footprint = Math.max(0.05, volPack / K.packThicknessM);   // m^2
  const spanL     = Math.sqrt(footprint);                          // square tray
  const wPress    = nGov * mPack * G0 / footprint;                 // N/m^2
  const Mtray     = 0.048 * wPress * spanL * spanL;                // N.m per m
  const tFace     = Math.max(K.trayMinFaceM,
                             Mtray / (K.mountMatSigma * K.trayCoreThkM));
  const mMount    = (2 * tFace * footprint * K.mountMatRho
                    + K.trayCoreThkM * footprint * K.trayCoreRho) * K.trayNonOptimum;

  /* Thermal-runaway protection — see the header for the two MOC VTOL.2440
     routes and why the default changed. */
  const volM3 = volPack;
  const faceA = 6 * Math.pow(Math.max(1e-4, volM3), 2 / 3);
  const trStrategy = p.trStrategy ?? "nonPropagation";
  const nModules = Math.max(1, Math.ceil((g.Ncells || 1) / K.cellsPerModule));
  const mContain = mPack * (trStrategy === "containment"
    ? K.containmentFracPack                        // DO-311A enclosure route
    : K.nonPropagationFracPack);                   // protection-layers route

  const mass = mBTMS + mBMS + mMount + mContain;

  return {
    mass, btms: mBTMS, bms: mBMS, mounts: mMount, containment: mContain,
    QhovW: Qhov, QcruiseW: Qcr, QrejectW: Qreject,
    btmsCapped, btmsFracPack: mBTMS / mPack,
    dTHoverK: dTHover, tPeakC, withinMax, withinOpt, cruiseBalanced,
    packLocation: p.packLocation ?? "other", locationLabel: loc.label,
    loadFactors: loc, nGoverning: nGov,
    packVolumeM3: volM3, packFaceAreaM2: faceA,
    trStrategy, nModules,
    trBasis: trStrategy === "containment"
      ? "DO-311A-style containment enclosure (MOC VTOL.2440 warns this penalises energy/weight)"
      : "protection-layers / non-propagation route (MOC-3 SC-VTOL VTOL.2440, 21 Jun 2023)",
    trayFootprintM2: footprint, trayFaceThkM: tFace, trayMomentNm: Mtray,
    massFracPack: mass / mPack,
    basis: "SC-VTOL MOC VTOL.2325(a)(4) load factors; MOC-3 VTOL.2440 thermal "
         + "runaway (RTCA DO-311A baseline); published eVTOL liquid-"
         + "cooling mass band (<20% of pack); Li-ion 55 C limit, cp 1050 J/kgK",
  };
}
