/* =====================================================================
   NASA CR-2144 — Heffley & Jewell, "Aircraft Handling Qualities Data",
   Systems Technology Inc. for NASA, December 1972. 352 pp.
   Vendored: eVTOL_Sizing_Research/classes/cross-class/sources/
             NASA-CR-2144_Heffley-Jewell-1972_Aircraft-handling-qualities-data.pdf
   =====================================================================
   The four transport aircraft of the report, transcribed from the rendered
   page images (the OCR layer is unusable for the tables): mass, inertia and
   flight-condition parameters; longitudinal and lateral-directional
   DIMENSIONAL derivatives (body axis, primed lateral derivatives); the
   printed denominator factors (phugoid, short period, spiral, roll, Dutch
   roll); and the handling-qualities parameters (n/alpha, CAP, 1/C(1/10)).
   Every block carries the printed page it was read from. Units as printed:
   ft, lb, slug-ft^2, ft/s, 1/s, rad (Appendix A, pp. A-9/A-10 define the
   printout mnemonics).

   Why these four: they are the transports in the report, with the data
   supplied by the airframers (Boeing D6-30643 for the 747; Lockheed's C-5
   flight-control report; Lockheed/AFFTC Jetstar flight evaluation; NASA's
   flight-measured 880M), and they span 24,000 to 655,000 lb.

   What they are for: validation/wing-modes-cr2144.mjs feeds these
   derivatives through the SAME modal approximations engine/wingmodes.js
   uses on the sized eVTOL, and compares with the report's own factors.
   That measures the approximations, which is the one thing the eVTOL side
   cannot measure because no eVTOL publishes modal data.

   Transcription fidelity: the report's own characteristic polynomials
   (Appendix C, pp. C-1, C-2, C-4) evaluated from these numbers give roots
   that match the printed factors to about 1 % for the short period, Dutch
   roll and roll mode at all 36 flight conditions; the harness gates that.
   ===================================================================== */
export { B747 } from "./b747.js";
export { JETSTAR } from "./jetstar.js";
export { CV880M } from "./cv880m.js";
export { C5A } from "./c5a.js";
import { B747 } from "./b747.js";
import { JETSTAR } from "./jetstar.js";
import { CV880M } from "./cv880m.js";
import { C5A } from "./c5a.js";
export const CR2144_AIRCRAFT = [B747, JETSTAR, CV880M, C5A];
export const CR2144_SOURCE = {
  title: "Aircraft Handling Qualities Data",
  authors: "Heffley, R. K. and Jewell, W. F.",
  report: "NASA CR-2144",
  year: 1972,
  file: "classes/cross-class/sources/NASA-CR-2144_Heffley-Jewell-1972_Aircraft-handling-qualities-data.pdf",
  pdfPageOffset: 5,   // printed page p is PDF index p + 5 (0-based)
};
