/* NASA CR-2144, Heffley & Jewell 1972, Section VII "Lockheed Jetstar" — transcribed
   from the page images (printed page numbers; PDF index = printed + 5). Body axis,
   bare airframe. Data source per CR-2144 p.192: Myers & Cross, "Jetstar Flight
   Evaluation", AFFTC. Cross-checks: YV = YB/U_0 (p.188 vs p.183) to 3 figures.
   PHUGOID NOTE: at F/C 7 (M .75) and 10 (M .80) the denominator prints two REAL
   roots in place of the phugoid pair (Appendix A p.327: values in parentheses are
   a quadratic; bare values are first-order) and Table VII-6 prints TUCK(2) there —
   the phugoid has split into a tuck divergence and a subsidence. Those two
   conditions are excluded from any phugoid comparison, by the reference's own
   statement. */
export const JETSTAR = {
  name: "Lockheed Jetstar", source: "NASA CR-2144 §VII pp.166-192",
  geometry: { S_ft2: 542.5, b_ft: 53.75, cbar_ft: 10.93, page: 169 },
  /* Table VII-2, p.183 */
  fc: [
    { n: 1,  h_ft: 0,     M: 0.200, U_fps: 224, ktas: 133, W_lb: 23905, Ix: 42275,  Iy: 126106, Iz: 160113, Ixz: 5470, eps_deg: -2.65, q_psf: 59.4, alpha_deg: 6.50 },
    { n: 2,  h_ft: 0,     M: 0.230, U_fps: 257, ktas: 152, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 78.4, alpha_deg: 11.2 },
    { n: 3,  h_ft: 0,     M: 0.400, U_fps: 447, ktas: 265, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 237,  alpha_deg: 4.00 },
    { n: 4,  h_ft: 0,     M: 0.525, U_fps: 586, ktas: 347, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 408,  alpha_deg: 2.70 },
    { n: 5,  h_ft: 20000, M: 0.350, U_fps: 363, ktas: 215, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 83.5, alpha_deg: 9.90 },
    { n: 6,  h_ft: 20000, M: 0.550, U_fps: 570, ktas: 338, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 206,  alpha_deg: 4.50 },
    { n: 7,  h_ft: 20000, M: 0.750, U_fps: 778, ktas: 461, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 383,  alpha_deg: 2.60 },
    { n: 8,  h_ft: 40000, M: 0.500, U_fps: 484, ktas: 287, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 69.0, alpha_deg: 11.4 },
    { n: 9,  h_ft: 40000, M: 0.650, U_fps: 629, ktas: 373, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 117,  alpha_deg: 7.00 },
    { n: 10, h_ft: 40000, M: 0.800, U_fps: 774, ktas: 459, W_lb: 38205, Ix: 118779, Iy: 135876, Iz: 243518, Ixz: 5061, eps_deg: -2.32, q_psf: 177,  alpha_deg: 4.20 },
  ],
  /* Table VII-3, p.184 (Zwd and Zq printed as 0.) */
  long: {
    Xu:  [-0.0166, -0.00456, -0.0102, -0.0136, -0.00324, -0.00697, -0.0157, -0.00353, -0.00168, -0.211e-5],
    Zu:  [-0.175, -0.103, -0.0593, -0.0305, -0.0804, -0.0436, -0.0212, -0.0614, -0.0408, -0.0348],
    Mu:  [0.00131, 0.00175, 0.000549, 0.000727, 0.00102, 0.000815, -0.000473, 0.000902, 0.000747, -0.00425],
    Xw:  [0.108, 0.164, 0.118, 0.103, 0.111, 0.0918, 0.0689, 0.0858, 0.0498, 0.0266],
    Zw:  [-1.01, -0.723, -1.24, -1.65, -0.565, -0.881, -1.33, -0.354, -0.475, -0.655],
    Mw:  [-0.00991, -0.00902, -0.0146, -0.0201, -0.00665, -0.0107, -0.0154, -0.00401, -0.00561, -0.00760],
    Zwd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Zq:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Mwd: [-0.000910, -0.000834, -0.000848, -0.000806, -0.000447, -0.000482, -0.000574, -0.000207, -0.000237, -0.000280],
    Mq:  [-0.546, -0.582, -1.03, -1.33, -0.439, -0.724, -1.09, -0.279, -0.380, -0.506],
    Xde: [1.97, 2.78, 3.02, 3.51, 2.62, 2.96, 3.34, 2.49, 2.66, 2.54],
    Zde: [-17.2, -14.0, -43.2, -74.6, -15.0, -37.5, -73.5, -12.4, -21.7, -34.6],
    Mde: [-2.26, -2.80, -8.38, -14.6, -2.95, -7.47, -14.5, -2.47, -4.27, -6.78],
    page: 184,
  },
  /* Table VII-4, p.185: denominator. Phugoid pair printed in parentheses (quadratic);
     at F/C 7 and 10 two real roots are printed instead (tuck), recorded as null here
     with the real roots kept beside them. */
  longModes: {
    phZeta: [0.0521, 0.0293, 0.0626, 0.102, 0.0386, 0.0498, null, 0.0600, 0.0492, null],
    phWn:   [0.188, 0.160, 0.0797, 0.0644, 0.115, 0.0751, null, 0.0937, 0.0709, null],
    phRealRoots: { 7: [-0.0195, 0.0339], 10: [0.102, -0.134] },
    spZeta: [0.528, 0.456, 0.475, 0.477, 0.355, 0.362, 0.382, 0.252, 0.259, 0.289],
    spWn:   [1.66, 1.66, 2.79, 3.75, 1.64, 2.60, 3.77, 1.44, 1.93, 2.45],
    page: 185,
  },
  /* Table VII-6, p.187 */
  longHQ: {
    nAlpha_gPerRad: [6.32, 5.24, 16.0, 28.0, 5.86, 14.5, 30.0, 4.90, 8.64, 15.0],
    CAP: [0.425, 0.506, 0.478, 0.492, 0.444, 0.459, 0.468, 0.406, 0.425, 0.413],
    invC10: [1.70, 1.40, 1.47, 1.48, 1.04, 1.06, 1.13, 0.711, 0.731, 0.825],
    tuckT2_s: { 7: 35.4, 10: 5.17 },
    page: 187,
  },
  /* Table VII-7, p.188 */
  lat: {
    Yv: [-0.140, -0.100, -0.175, -0.229, -0.0756, -0.119, -0.167, -0.0469, -0.0618, -0.0781],
    Yb: [-31.2, -25.8, -78.0, -134, -27.5, -67.8, -130, -22.7, -38.9, -60.5],
    Lb: [-4.05, -3.42, -5.27, -7.28, -3.23, -4.43, -4.93, -2.75, -2.93, -2.27],
    Nb: [1.34, 1.10, 3.30, 5.47, 1.21, 2.99, 5.63, 1.02, 1.75, 2.66],
    Lp: [-1.85, -0.752, -1.30, -1.75, -0.582, -0.935, -1.34, -0.380, -0.492, -0.635],
    Np: [-0.245, -0.173, -0.164, -0.187, -0.121, -0.119, -0.137, -0.0840, -0.0758, -0.0682],
    Lr: [0.517, 0.234, 0.181, 0.170, 0.169, 0.124, 0.0868, 0.105, 0.0936, 0.0551],
    Nr: [-0.190, -0.172, -0.261, -0.333, -0.125, -0.178, -0.252, -0.0804, -0.0994, -0.120],
    page: 188,
  },
  /* Table VII-8, p.189: lateral denominator */
  latModes: {
    spiralInvT: [-0.0112, 0.00318, 0.00535, 0.00467, 0.000351, 0.00242, 0.00186, -0.000800, -0.000246, -0.000201],
    rollInvT:   [1.95, 0.958, 1.45, 1.89, 0.741, 1.04, 1.42, 0.499, 0.576, 0.680], /* F/C 10 re-read at 300 dpi: .680, and the exact quartic gives .68 */
    drZeta:     [0.0832, 0.0229, 0.0729, 0.0856, 0.0147, 0.0499, 0.0690, 0.00352, 0.0267, 0.0453],
    drWn:       [1.45, 1.39, 1.97, 2.47, 1.37, 1.86, 2.45, 1.26, 1.46, 1.69],
    page: 189,
  },
};
