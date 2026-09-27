/* NASA CR-2144, Heffley & Jewell 1972, Section IX "Boeing 747" — transcribed from
   the page images (printed page numbers; PDF index = printed + 5). Body-axis system,
   bare airframe, SAS off. Units as printed: ft, lb, slug-ft^2, ft/s, 1/s, rad.
   Data source per CR-2144 p.242: Hanke & Nordwall, "The Simulation of a Large Jet
   Transport Aircraft", Boeing D6-30643 (1970).
   Transcription cross-checks applied: (a) the DENOMINATOR rows are printed on both
   Table IX-5 (elevator, p.231) and IX-6 (thrust, p.232) and agree; (b) YV = YB/U_0
   (p.234 vs p.229) agrees to 3 figures; (c) Dutch-roll period on p.241 equals
   2*pi/(W(DET)1*sqrt(1-Z^2)) from p.235. */
export const B747 = {
  name: "Boeing 747", source: "NASA CR-2144 §IX pp.210-242",
  geometry: { S_ft2: 5500, b_ft: 195.68, cbar_ft: 27.31, page: 229 },
  /* Table IX-3, p.229: dimensional, mass and flight-condition parameters */
  fc: [
    { n: 1,  h_ft: 0,     M: 0.198, U_fps: 221, ktas: 131, W_lb: 564032, Ix: 0.142e8, Iy: 0.323e8, Iz: 0.454e8, Ixz: 870050, eps_deg: -1.60, q_psf: 58.1, alpha_deg: 8.50, cfg: "power approach, 20° flaps, gear up" },
    { n: 2,  h_ft: 0,     M: 0.249, U_fps: 278, ktas: 165, W_lb: 564032, Ix: 0.142e8, Iy: 0.323e8, Iz: 0.454e8, Ixz: 870050, eps_deg: -1.60, q_psf: 92.2, alpha_deg: 5.70, cfg: "power approach, 20° flaps, gear up" },
    { n: 3,  h_ft: 0,     M: 0.450, U_fps: 502, ktas: 298, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 300,  alpha_deg: 3.10, cfg: "nominal, clean" },
    { n: 4,  h_ft: 0,     M: 0.650, U_fps: 726, ktas: 430, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 626,  alpha_deg: 0.0,  cfg: "nominal, clean" },
    { n: 5,  h_ft: 20000, M: 0.500, U_fps: 518, ktas: 307, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 170,  alpha_deg: 6.80, cfg: "nominal, clean" },
    { n: 6,  h_ft: 20000, M: 0.650, U_fps: 674, ktas: 399, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 288,  alpha_deg: 2.50, cfg: "nominal, clean" },
    { n: 7,  h_ft: 20000, M: 0.800, U_fps: 830, ktas: 492, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 436,  alpha_deg: 0.0,  cfg: "nominal, clean" },
    { n: 8,  h_ft: 40000, M: 0.700, U_fps: 678, ktas: 402, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 135,  alpha_deg: 7.30, cfg: "nominal, clean" },
    { n: 9,  h_ft: 40000, M: 0.800, U_fps: 774, ktas: 459, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 177,  alpha_deg: 4.60, cfg: "nominal, clean" },
    { n: 10, h_ft: 40000, M: 0.900, U_fps: 871, ktas: 516, W_lb: 636636, Ix: 0.182e8, Iy: 0.331e8, Iz: 0.497e8, Ixz: 970056, eps_deg: -1.76, q_psf: 224,  alpha_deg: 2.40, cfg: "nominal, clean" },
  ],
  /* Table IX-4, p.230: longitudinal dimensional derivatives (body axis). Rows are
     per flight condition 1..10. Units: Xu*,Zu*,Xw,Zw,Zq,Mq 1/s; Mu*,Mw,Mwd 1/(s·ft); Zwd 1/s^2. */
  long: {
    Xu:  [-0.0209, -0.0108, -0.00499, -0.00777, -0.00247, -0.00280, -0.00643, 0.00187, -0.00276, -0.0200],
    Zu:  [-0.202, -0.150, -0.0807, -0.126, -0.0679, -0.0832, -0.0941, -0.0696, -0.0650, -0.0424],
    Mu:  [0.000117, 0.000181, 0.000146, -0.000199, 0.000247, 0.885e-4, -0.000222, 0.000259, 0.000193, -0.623e-4],
    Xw:  [0.122, 0.106, 0.0743, 0.0345, 0.0782, 0.0482, 0.0253, 0.0263, 0.0389, 0.0159],
    Zw:  [-0.512, -0.613, -0.736, -0.963, -0.433, -0.539, -0.624, -0.292, -0.317, -0.401],
    Mw:  [-0.00177, -0.00193, -0.00262, -0.00239, -0.00170, -0.00190, -0.00153, -0.00101, -0.00105, -0.00190],
    Zwd: [0.0334, 0.0338, 0.0297, 0.0253, 0.0157, 0.0156, 0.0144, 0.00704, 0.00656, 0.00614],
    Zq:  [-6.22, -7.58, -10.4, -12.8, -6.39, -8.09, -9.98, -4.32, -5.16, -6.71],
    Mwd: [-0.000246, -0.000240, -0.000221, -0.000228, -0.000125, -0.000155, -0.000212, -0.905e-4, -0.000116, -0.000160],
    Mq:  [-0.357, -0.437, -0.699, -0.925, -0.421, -0.535, -0.659, -0.284, -0.339, -0.401],
    Xde: [0.959, 0.971, 1.18, 0, 2.02, 1.15, 0, 1.93, 1.44, 0.781],
    Zde: [-6.42, -9.73, -21.8, -32.4, -16.9, -26.4, -32.7, -15.1, -17.9, -18.6],
    Mde: [-0.378, -0.574, -1.40, -2.07, -1.09, -1.69, -2.08, -0.970, -1.16, -1.22],
    page: 230,
  },
  /* Tables IX-5/IX-6, pp.231-232: longitudinal denominator factors.
     (s^2 + 2 z w s + w^2)_1 = phugoid, (…)_2 = short period. */
  longModes: {
    phZeta: [0.0417, 0.0228, 0.0319, 0.110, 0.0241, 0.0264, 0.323, 0.0636, 0.0489, 0.304],
    phWn:   [0.152, 0.127, 0.0753, 0.0368, 0.0823, 0.0653, 0.00984, 0.0781, 0.0673, 0.0311],
    spZeta: [0.616, 0.629, 0.575, 0.637, 0.446, 0.473, 0.567, 0.357, 0.387, 0.351],
    spWn:   [0.771, 0.910, 1.37, 1.63, 1.04, 1.26, 1.30, 0.879, 0.964, 1.35],
    page: 231,
  },
  /* Table IX-7, p.233: longitudinal handling-qualities parameters, stick fixed. */
  longHQ: {
    nAlpha_gPerRad: [3.27, 5.00, 10.8, 20.8, 6.50, 10.7, 15.4, 5.76, 7.22, 10.1],
    CAP: [0.170, 0.157, 0.166, 0.124, 0.160, 0.145, 0.108, 0.131, 0.127, 0.179],
    invC10: [2.13, 2.21, 1.92, 2.26, 1.36, 1.46, 1.88, 1.04, 1.14, 1.02],
    dGammadU_degPerKt: [0.0349, 0.0123, -0.00726, -0.0194, 0.00900, -0.00166, -0.0137, 0.0452, 0.00494, -0.0486],
    page: 233,
  },
  /* Table IX-8, p.234: lateral-directional dimensional derivatives (body axis, primed). */
  lat: {
    Yv: [-0.0890, -0.0997, -0.143, -0.197, -0.0822, -0.104, -0.120, -0.0488, -0.0558, -0.0606],
    Yb: [-19.7, -27.8, -71.7, -143, -42.6, -70.4, -99.4, -33.1, -43.2, -52.8],
    Lb: [-1.33, -1.63, -3.19, -5.45, -2.05, -2.96, -4.12, -1.45, -3.05, -1.32],
    Nb: [0.168, 0.247, 0.810, 1.82, 0.419, 0.923, 1.62, 0.404, 0.598, 0.971],
    Lp: [-0.975, -1.10, -1.12, -1.47, -0.652, -0.804, -0.974, -0.404, -0.465, -0.459],
    Np: [-0.166, -0.125, -0.0706, -0.0214, -0.0701, -0.0531, -0.0157, -0.0366, -0.0316, 0.00284],
    Lr: [0.327, 0.198, 0.379, 0.256, 0.376, 0.317, 0.292, 0.312, 0.388, 0.280],
    Nr: [-0.217, -0.229, -0.246, -0.344, -0.140, -0.193, -0.232, -0.0963, -0.115, -0.141],
    page: 234,
  },
  /* Table IX-9, p.235: lateral denominator factors. 1/T_1 = spiral, 1/T_2 = roll,
     (z;w)_1 = Dutch roll. A negative 1/T means the root is in the right half plane. */
  latModes: {
    spiralInvT: [0.0427, 0.0465, 0.0194, 0.0203, 0.00903, 0.0108, 0.0103, -0.00234, 0.00730, -0.00777],
    rollInvT:   [1.11, 1.23, 1.23, 1.56, 0.745, 0.913, 1.06, 0.462, 0.562, 0.478],
    drZeta:     [0.0878, 0.107, 0.126, 0.153, 0.0693, 0.0823, 0.0981, 0.0568, 0.0349, 0.0929],
    drWn:       [0.735, 0.746, 1.06, 1.40, 0.863, 1.07, 1.31, 0.788, 0.947, 1.02],
    page: 235,
  },
  /* Table IX-13, p.241: lateral HQ parameters (only the rows read so far). */
  latHQ: {
    drPeriod_s: [8.59, 8.47, 5.98, 4.53, 7.30, 5.87, 4.83, 7.99, 6.64, 6.19],
    page: 241,
  },
};
