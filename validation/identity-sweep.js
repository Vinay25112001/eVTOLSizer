/* The design points validation/identities.mjs checks its relations on, as
   DATA (moved verbatim 2026-09-16). They are also the tool's DOMAIN OF
   VERIFICATION in the NASA-STD-7009B sense - the inputs for which the
   solution has been checked against independent re-derivations - so
   src/lib/domain.js reads them to say when a design leaves that domain.
   Keys are ENGINE inputs: `range` includes the reserve distance. */

export const IDENTITY_BASE = {
  payload:455, range:190, vCruise:67, cruiseAlt:1000, hoverHeight:15.24, reserveMinutes:20,
  LD:14, AR:9, eOsw:0.85, clDesign:0.55, taper:0.45, tc:0.15, nPropHover:6, propDiam:3.0,
  twRatio:1.3, convTolExp:-6, etaHov:0.70, etaSys:0.80, rateOfClimb:5.08, climbAngle:5,
  descentAngle:6, climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.90,
  socMin:0.19, ewf:0.50, fusLen:7.2, fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5,
};
export const IDENTITY_LAYOUTS = ["liftcruise", "hybrid", "hybridPusher", "tiltrotor", "multicopter", "sideBySide"];

export const IDENTITY_SWEEP = {
  payload:[150,800], range:[60,240], vCruise:[35,110], cruiseAlt:[200,2800], LD:[9,19],
  AR:[6,14], clDesign:[0.35,0.95], taper:[0.25,0.7], tc:[0.10,0.19], propDiam:[1.8,4.2],
  twRatio:[1.0,1.5], etaHov:[0.5,0.8], etaSys:[0.6,0.9], sedCell:[180,460], etaBat:[0.8,0.96],
  socMin:[0.08,0.3], ewf:[0.35,0.6], fusLen:[4,9], fusDiam:[1.0,2.2], deltaISA:[-10,25],
  vtGamma:[25,60], vtCh:[0.2,0.55], vtCv:[0.02,0.08], vtAR:[1.8,3.5],
};
/* THE WHOLE SLIDER RANGE, added 2026-09-16. The sweep above is narrower than
   the controls: its L/D floor of 9 sits above the app's own default of 8.5,
   so the default design was outside the verified domain. identities.mjs now
   also draws points over these ranges (the sliders' min/max in App.jsx), and
   this is the envelope the app reports as verified. `range` is the ENGINE
   range: the slider's 50-250 km plus up to 110 km of reserve. clDesign has no
   slider and keeps its range. */
export const IDENTITY_SWEEP_FULL = {
  payload:[100,900], range:[50,360], vCruise:[30,120], cruiseAlt:[200,3000], LD:[5,22],
  AR:[4,16], clDesign:[0.35,0.95], taper:[0.2,0.8], tc:[0.08,0.20], propDiam:[1.0,5.0],
  twRatio:[1.0,1.6], etaHov:[0.4,0.85], etaSys:[0.5,0.95], sedCell:[150,500], etaBat:[0.70,0.99],
  socMin:[0.05,0.40], ewf:[0.30,0.70], fusLen:[3.0,10.0], fusDiam:[0.8,2.5], deltaISA:[-15,30],
  vtGamma:[20,70], vtCh:[0.15,1.00], vtCv:[0.015,0.10], vtAR:[1.5,4.0],
};
