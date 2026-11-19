/* =====================================================================
   MISSION PROFILE — the sized mission, as legs the Fly tab can fly
   =====================================================================
   Each class reports its mission in its own detail (engine.js, the
   `mission` list and `missionTimes`):

     transport, bizjet   taxi and take-off fuel; climb, cruise and descent
                         each with minutes, distance and fuel; the top of
                         climb. Climb + cruise + descent = the design range.
     trainer             a start/taxi/take-off fuel allowance; climb minutes
                         and fuel (no distance); cruise distance and fuel (no
                         time). Descent is not modelled.
     turboprop           one Breguet trip over the design range and its
                         fuel. Climb and descent sit inside the fuel
                         fractions and are not separated.

   The Fly tab draws a whole flight, so it needs a leg where the sizing
   has none. Those legs are DRAWN and say so, and a drawn leg carries no
   number: the tab prints "not computed" rather than a distance, time,
   height or fuel the sizing never produced. The only arithmetic added
   here is a cruise time where the class gives a cruise distance and speed
   but no time (distance ÷ speed), and that is marked `derived`.

   THE CLOCK IS NOT TO SCALE. A 400-minute flight replayed at one rate is
   five minutes of cruise; so each leg gets a fixed share of the replay
   (`play`) and the tab says so. The legs' own times are the sizing's.
   The path between a leg's two computed ends is drawn as a straight line,
   which is also said.

   A leg's `prov` is one of: sized (every fact it prints is the sizing's),
   derived (one fact is arithmetic on sized facts, named in `why`), partly
   (some facts sized, the path drawn) or drawn (nothing printed).
   ===================================================================== */

/* Replay seconds per leg, by kind. */
export const PLAY_SECONDS = Object.freeze({ ground: 6, climb: 10, cruise: 22, descent: 10, landing: 6 });

/* Drawn legs need SOME horizontal extent to be drawn at all. These are
   drawing conventions, never printed. */
const DRAWN_CLIMB_SHARE = 0.08;     // of the sized distance, when climb distance is not computed
export const DRAWN_ROLL_M = 1200;   // the ground roll drawn on the runway, take-off and landing
const NM = 1852, FT = 0.3048;

/* Minutes, distance and fuel of the named segments. */
function seg(result, re) {
  return (result.mission ?? []).find((s) => re.test(s.name || "")) ?? null;
}
const sumKg = (...ss) => {
  const v = ss.filter(Boolean).reduce((a, s) => a + (Number.isFinite(s.kg) ? s.kg : 0), 0);
  return ss.some((s) => s && Number.isFinite(s.kg)) ? v : null;
};

export function profileRefusal(result) {
  if (!result) return "There is no design to fly: the sizing has not produced a result.";
  const alt = result.cruise?.altFt, kt = result.cruise?.speedKt;
  if (!Number.isFinite(alt) || !Number.isFinite(kt) || kt <= 0) return "The sizing gave no cruise speed and altitude, so there is no mission to fly.";
  if (!(result.mission ?? []).length) return "This result carries no mission (an analysed aircraft with no fuel breakdown), so there is nothing to fly.";
  return null;
}

/* Legs in flight order. Each: key, label, kind, prov ("sized" | "derived"
   | "drawn"), why (for drawn), from/to ground distance in metres and
   altitude in feet, and the sized facts it may print (minutes, nm, kg). */
export function missionProfileOf(result) {
  const refusal = profileRefusal(result);
  if (refusal) return { ok: false, refusal };
  const altFt = result.cruise.altFt, kt = result.cruise.speedKt;
  const legs = [];
  let x = 0;
  const push = (leg) => { legs.push({ ...leg, fromM: x, toM: x + leg.lengthM }); x += leg.lengthM; };

  const taxi = seg(result, /^Taxi/), to = seg(result, /^Take-off$/), allowance = seg(result, /allowance/i);
  const climb = seg(result, /^Climb$/), cruise = seg(result, /^Cruise$/), descent = seg(result, /^Descent$/);
  const trip = seg(result, /^Trip/);
  /* The jets' mission (transport/mission.js) cruises where its climb
     levelled off and descends from there; that is usually the cruise
     altitude asked for, and lower when the climb meets its ceiling first.
     The other classes give no top of climb and are drawn at the cruise
     altitude. */
  const toc = Number.isFinite(result.topOfClimbFt) ? result.topOfClimbFt : altFt;

  push({ key: "takeoff", label: "Take-off", kind: "ground", prov: "drawn", lengthM: DRAWN_ROLL_M, fromFt: 0, toFt: 0,
         why: "the take-off run is not computed by the sizing; only its fuel is",
         kg: sumKg(taxi, to, allowance), kgLabel: allowance ? "start, taxi and take-off allowance" : "taxi-out and take-off fuel" });

  /* The leg that carries the distance. The jets size climb, cruise and
     descent separately, and the three add up to the range. The trainer
     credits its cruise with the whole range; the turboprop flies one
     Breguet trip over it. A climb or descent the class does not separate
     is drawn INSIDE that distance, so the track is still the sized range
     and no drawn leg lengthens it. */
  const main = cruise && Number.isFinite(cruise.nm) ? cruise : trip && Number.isFinite(trip.nm) ? trip : null;
  if (!main) return { ok: false, refusal: "The sizing reports no cruise distance for this design, so there is no path to fly." };
  const mainM = main.nm * NM;
  const climbSized = !!(climb && Number.isFinite(climb.nm) && Number.isFinite(climb.minutes));
  const descentSized = !!(descent && Number.isFinite(descent.nm) && Number.isFinite(descent.minutes));
  const carveClimb = climbSized ? 0 : mainM * DRAWN_CLIMB_SHARE;
  const carveDescent = descentSized ? 0 : mainM * DRAWN_CLIMB_SHARE;
  const carvedParts = [carveClimb > 0 && "climb", carveDescent > 0 && "descent"].filter(Boolean);
  const carveNote = carvedParts.length ? `the drawn ${carvedParts.join(" and ")} sit inside this distance, so the path flown level is shorter than it` : null;
  const join = (...xs) => xs.filter(Boolean).join("; ") || null;

  /* Climb */
  if (climbSized) {
    push({ key: "climb", label: "Climb", kind: "climb", prov: "sized", lengthM: climb.nm * NM, fromFt: 0, toFt: toc,
           minutes: climb.minutes, nm: climb.nm, kg: climb.kg });
  } else if (climb && Number.isFinite(climb.minutes)) {
    push({ key: "climb", label: "Climb", kind: "climb", prov: "partly", lengthM: carveClimb, fromFt: 0, toFt: toc,
           why: "the climb's time and fuel are computed; its distance is not, so its path is drawn inside the cruise distance",
           minutes: climb.minutes, kg: climb.kg });
  } else {
    push({ key: "climb", label: "Climb", kind: "climb", prov: "drawn", lengthM: carveClimb, fromFt: 0, toFt: toc,
           why: "this class does not separate the climb; it sits inside the trip's distance and fuel" });
  }

  /* Cruise */
  if (main === cruise) {
    const sized = Number.isFinite(cruise.minutes);
    push({ key: "cruise", label: "Cruise", kind: "cruise", prov: sized ? "sized" : "derived", lengthM: mainM - carveClimb - carveDescent,
           fromFt: toc, toFt: toc, nm: cruise.nm, kg: cruise.kg, kt,
           minutes: sized ? cruise.minutes : (cruise.nm / kt) * 60,
           why: join(sized ? null : "cruise time is the sized distance ÷ the sized cruise speed", carveNote) });
  } else {
    push({ key: "cruise", label: "Cruise (whole trip)", kind: "cruise", prov: "sized", lengthM: mainM - carveClimb - carveDescent,
           fromFt: toc, toFt: toc, nm: trip.nm, kg: trip.kg, kt, tripFuel: true,
           why: join("the trip is one Breguet cruise over the design range; its distance and fuel cover take-off to landing", carveNote) });
  }

  /* Descent */
  if (descentSized) {
    push({ key: "descent", label: "Descent", kind: "descent", prov: "sized", lengthM: descent.nm * NM, fromFt: toc, toFt: 0,
           minutes: descent.minutes, nm: descent.nm, kg: descent.kg });
  } else {
    push({ key: "descent", label: "Descent", kind: "descent", prov: "drawn", lengthM: carveDescent, fromFt: toc, toFt: 0,
           why: trip ? "this class does not separate the descent; it sits inside the trip's distance and fuel"
                     : "the descent is not modelled for this class; its path is drawn inside the cruise distance" });
  }

  push({ key: "landing", label: "Landing", kind: "landing", prov: "drawn", lengthM: DRAWN_ROLL_M, fromFt: 0, toFt: 0,
         why: "the landing run is not computed by the sizing" });

  const reserves = (result.mission ?? []).filter((s) => s.reserve).map((s) => ({ name: s.name, kg: s.kg, minutes: s.minutes ?? null }));
  const listed = new Set([taxi, to, allowance, climb, cruise, descent, trip].filter(Boolean));
  const other = (result.mission ?? []).filter((s) => !s.reserve && !listed.has(s)).map((s) => ({ name: s.name, kg: s.kg }));

  const flown = legs.filter((l) => Number.isFinite(l.minutes));
  return {
    ok: true, legs, trackM: x, altFt, cruiseFt: toc, belowAsked: altFt - toc > 1, kt, mach: result.cruise.mach ?? null,
    designRangeNm: result.designRangeNm ?? null,
    /* The distance the mission's own legs print: the range this mission
       covers, take-off to landing (the runway rolls are drawn). */
    missionNm: legs.reduce((a, l) => a + (Number.isFinite(l.nm) ? l.nm : 0), 0),
    flightMinutes: flown.length === legs.filter((l) => l.kind !== "ground" && l.kind !== "landing").length
      ? flown.reduce((a, l) => a + l.minutes, 0) : null,
    reserves, other,
    playSeconds: legs.reduce((a, l) => a + PLAY_SECONDS[l.kind], 0),
  };
}

/* Where the replay is at `s` seconds in: the leg, how far through it
   (0-1), the ground distance and height in metres for the scene, and the
   attitude of the drawn path (rise over run). Nothing returned here is
   printed as a number except through the leg's own sized facts. */
export function profileAt(profile, s) {
  let t = Math.max(0, s);
  for (let i = 0; i < profile.legs.length; i++) {
    const leg = profile.legs[i], dur = PLAY_SECONDS[leg.kind];
    if (t <= dur || i === profile.legs.length - 1) {
      const f = Math.min(1, t / dur);
      const xM = leg.fromM + f * (leg.toM - leg.fromM);
      const hM = (leg.fromFt + f * (leg.toFt - leg.fromFt)) * FT;
      const pitch = Math.atan2((leg.toFt - leg.fromFt) * FT, Math.max(1, leg.toM - leg.fromM));
      return { i, leg, f, xM, hM, pitch };
    }
    t -= dur;
  }
  return null;
}

/* The replay second each leg starts at, for the phase buttons. */
export function legStarts(profile) {
  const out = [];
  let t = 0;
  for (const leg of profile.legs) { out.push(t); t += PLAY_SECONDS[leg.kind]; }
  return out;
}

/* The whole path, sampled for the scene's line and the side chart:
   [metres along the ground, metres up]. */
export function pathPoints(profile) {
  const pts = [];
  for (const leg of profile.legs) {
    if (!pts.length) pts.push([leg.fromM, leg.fromFt * FT]);
    pts.push([leg.toM, leg.toFt * FT]);
  }
  return pts;
}
