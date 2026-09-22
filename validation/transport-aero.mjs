/* =====================================================================
   TRANSPORT DRAG BUILD-UP GATE (flops-aero.js)
   =====================================================================
   1-4  the port reproduces NASA Aviary's FLOPS-based aerodynamics
        component by component, using the expected values in Aviary's own
        unit tests (commit e12742d, aviary/subsystems/aerodynamics/
        flops_based/test/, Apache License 2.0; copies in
        eVTOL_Sizing_Research/classes/transport/sources/aviary_aero_e12742d/).
   5    the whole polar reproduces drag polars printed by FLOPS itself for
        three transports (the "unscaled drag" arrays in Aviary's
        test_computed_aero_group.py), judged as Aviary judges its own port:
        OpenMDAO assert_near_equal, i.e. ‖computed − FLOPS‖ / ‖FLOPS‖,
        at 5 % over every point and 0.4 % (LSA1) or 0.5 % over the first
        134 points. The worst single point is printed, not gated.
   ===================================================================== */

import { FLOPS_AERO_TABLES } from "../src/classes/transport/flops-aero-tables.js";
import { makeFlopsPolar, flopsComponents, flopsDesignPoint, skinFriction, skinFrictionDragFrom,
         formFactor, lagrange1, lagrange2, FLOPS_EXCRESCENCE } from "../src/classes/transport/flops-aero.js";
import { sizeTransport, analyzeTransport } from "../src/classes/transport/size.js";
import { flyMission } from "../src/classes/transport/mission.js";
import { aftNacelleDeltaCd } from "../src/classes/transport/layout.js";
import { TRANSPORT_INPUTS } from "../src/classes/transport/defaults.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const rel = (a, b) => (b === 0 ? Math.abs(a) : Math.abs(a / b - 1));
const maxRel = (a, b) => Math.max(...a.map((x, i) => rel(x, b[i])));
const normRel = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / b.reduce((s, x) => s + x * x, 0));

console.log("TRANSPORT DRAG BUILD-UP GATE");
console.log("=".repeat(72));

console.log("\n1. Tables and interpolation");
{
  const T = Object.entries(FLOPS_AERO_TABLES);
  check("every table's FLOPS code is rows·1000 + columns",
        T.every(([, t]) => t.code === t.rows.length * 1000 + t.cols.length), `${T.length} tables`);
  check("every grid is strictly ascending and every row is complete",
        T.every(([, t]) => [t.rows, t.cols].every((g) => g.every((v, i) => i === 0 || v > g[i - 1]))
                        && t.values.length === t.rows.length && t.values.every((r) => r.length === t.cols.length)));
  const t = FLOPS_AERO_TABLES.PCAR;
  check("lagrange2 returns the table value at every grid point",
        t.rows.every((x, i) => t.cols.every((y, j) => Math.abs(lagrange2(t, x, y) - t.values[i][j]) < 1e-12)));
  const g = [0, 1, 3, 4, 7], q = (x) => 2 - 3 * x + 0.5 * x * x;
  check("lagrange (second order) is exact for a quadratic, inside and beyond the grid",
        [-2, 0.3, 2.2, 5.5, 9].every((x) => Math.abs(lagrange1(g, g.map(q), x) - q(x)) < 1e-9));
}

console.log("\n2. Design Mach and lift coefficient (test_premission_aero.py, FLOPS outputs)");
{
  const c1 = flopsDesignPoint({ maxMach: 1.2, aspectRatio: 11.05, camber: 1, sweepDeg: 2.0191, tc: 0.04000001 });
  const c2 = flopsDesignPoint({ maxMach: 0.9, aspectRatio: 11.05, camber: 1, sweepDeg: 2.191, tc: 0.12 });
  const c3 = flopsDesignPoint({ maxMach: 1.2, aspectRatio: 11.05, camber: 1, sweepDeg: 2.191, tc: 0.12 });
  check("thin wing, M_max 1.2: M_des 0.753238, CL_des 0.909926",
        rel(c1.machDesign, 0.753238) < 1e-6 && rel(c1.clDesign, 0.909926) < 1e-6,
        `${c1.machDesign.toFixed(6)}, ${c1.clDesign.toFixed(6)}`);
  check("t/c 0.12, M_max 0.9 and 1.2: M_des 0.671145, CL_des 0.683002",
        [c2, c3].every((c) => rel(c.machDesign, 0.671145) < 1e-6 && rel(c.clDesign, 0.683002) < 1e-6));
  /* FLOPS prints three decimals for the three reference aircraft. LSA1's
     printed CL_des (0.568) is 0.0006 above the equation's 0.5674 (not a
     rounding difference; the equation is Aviary's and passes the unit
     cases above), so the check allows 0.001. */
  const lsa1 = flopsDesignPoint({ maxMach: 0.785, aspectRatio: 11.22091, sweepDeg: 25, tc: 0.13, airfoilTech: 1.92669766647637 });
  const lsa2 = flopsDesignPoint({ maxMach: 0.82, aspectRatio: 9.45, sweepDeg: 25.03, tc: 0.131732727515702, camber: 0.015, airfoilTech: 1.87 });
  const n3cc = flopsDesignPoint({ maxMach: 0.785, aspectRatio: 11.5587605382765, sweepDeg: 23.6286942529271, tc: 0.12233, camber: 0.015, airfoilTech: 1.6 });
  const r3 = (x, v) => Math.abs(x - v) <= 0.001;
  check("FLOPS design points within 0.001: LSA1 0.800/0.568, LSA2 0.799/0.523, N3CC 0.779/0.583",
        r3(lsa1.machDesign, 0.8) && r3(lsa1.clDesign, 0.568) && r3(lsa2.machDesign, 0.799) && r3(lsa2.clDesign, 0.523)
        && r3(n3cc.machDesign, 0.779) && r3(n3cc.clDesign, 0.583),
        [lsa1, lsa2, n3cc].map((d) => `${d.machDesign.toFixed(4)}/${d.clDesign.toFixed(4)}`).join(", "));
}

console.log("\n3. Skin friction (test_skinfriction_coef.py, test_skinfriction_drag.py)");
{
  const machs = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.775, 0.8, 0.825, 0.85, 0.875];
  const cfExp = [
    [0.02081979, 0.01830256, 0.01676351], [0.01812046, 0.01601054, 0.01471376], [0.01644993, 0.01458313, 0.01343178],
    [0.01526502, 0.01356561, 0.01251483], [0.01435403, 0.01277992, 0.01180471], [0.01361502, 0.01214004, 0.01122482],
    [0.01329152, 0.01185913, 0.01096975], [0.01313905, 0.01172656, 0.01084927], [0.01299212, 0.0115987, 0.010733],
    [0.01285029, 0.01147518, 0.01062061], [0.0127132, 0.01135567, 0.01051181], [0.0125805, 0.0112399, 0.01040636]];
  const reExp = [2535.112674, 3802.669010, 5070.225348];
  let worstCf = 0, worstRe = 0;
  machs.forEach((M, i) => [1, 1.5, 2].forEach((L, j) => {
    const r = skinFriction(M, 2.60239151, 389.97, L);
    worstCf = Math.max(worstCf, rel(r.cf, cfExp[i][j]));
    worstRe = Math.max(worstRe, rel(r.Re, reExp[j] * M / 0.2));
  }));
  check("Sommer & Short T′ cf matches Aviary at 36 points to 1e-6", worstCf < 1e-6, `worst ${worstCf.toExponential(1)}`);
  check("Reynolds number matches Aviary", worstRe < 1e-8, `worst ${worstRe.toExponential(1)}`);

  const fine = [0.13, 0.125, 0.1195, 10.0392, 1.5491, 1.5491];
  const Sw = [2396.56, 592.65, 581.13, 4158.62, 273.45, 273.45];
  const Re = [[15.0, 11, 18.3, 183.4, 17.6, 17.6], [17.0, 16, 15.3, 78.4, 23.6, 33.6]].map((r) => r.map((v) => v * 1e-6));
  const cf = [[0.00263, 0.00276, 0.00255, 0.00182, 0.00256, 0.00256], [0.00283, 0.00296, 0.00235, 0.00172, 0.00276, 0.00276]];
  const comps = fine.map((f, j) => ({ wetted: Sw[j], fineness: f, laminarUpper: 0.18, laminarLower: 0.12 }));
  const got = [0, 1].map((n) => skinFrictionDragFrom(comps, cf[n], Re[n], 198, 1.93, 0.06));
  check("skin-friction drag with laminar flow and 6 % excrescence: 14.91229, 15.01284",
        rel(got[0], 14.91229) < 1e-6 && rel(got[1], 15.01284) < 1e-6, got.map((v) => v.toFixed(5)).join(", "));
  check("FLOPS excrescence allowance is 6 %", FLOPS_EXCRESCENCE === 0.06);
  check("body form factor is 1 from fineness 20, surface form factor rises with t/c",
        formFactor(20, 1) === 1 && formFactor(35, 1) === 1 && formFactor(0.12, 1) > formFactor(0.08, 1));
}

console.log("\n4. Pressure and compressibility drag (test_lift_dependent_drag.py, test_compressibility_drag.py)");
{
  const one = [{ name: "w", wetted: 1, length: 1, fineness: 0.1 }];
  const CL = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55], M = [0.4, 0.45, 0.5, 0.55, 0.6, 0.85];
  const press = (g) => {
    const p = makeFlopsPolar({ wingArea: 1370, taper: 0.3, components: one, ...g });
    return M.map((m, i) => p.evaluate(m, CL[i], 2.6, 390).pressure);
  };
  const a = press({ camber: 1, sweepDeg: 25.03, aspectRatio: 11.05, tc: 0.123, design: { clDesign: 1.28, machDesign: 0.765 } });
  const ea = [0.01445345, 0.01278088, 0.01124887, 0.00982434, 0.00844742, 0.0];
  check("pressure drag, A outside the tables (edge interpolation)", maxRel(a, ea) < 1e-6, `worst ${maxRel(a, ea).toExponential(1)}`);
  const b = press({ camber: 1, sweepDeg: 25.07, aspectRatio: 11.05 * 0.5, tc: 0.132, design: { clDesign: 0.1234, machDesign: 0.4321 } });
  const eb = [0.01333307, 0.02305564, 0.0465636, 0.51400999, 0.79391369, 0.82316212];
  check("pressure drag, A inside the tables (interpolation across A)", maxRel(b, eb) < 1e-6, `worst ${maxRel(b, eb).toExponential(1)}`);

  const d = 1e-5;
  const mach = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.75, 0.775, 0.8, 0.825, 0.85, 0.875, 0.9, 0.95, 1.05, 1.1].map((x) => x + d);
  const ec = [0, 0, 0, 0, 0, 0, 0, 0, 0.00018641, 0.00079348, 0.00119559, 0.00155455, 0.00214888, 0.00339369,
              0.01738419, 0.02046643, 0.02259292, 0.03716558, 0.04926635, 0.04841961];
  const p = makeFlopsPolar({ wingArea: 1370, taper: 0.432, aspectRatio: 11.5, sweepDeg: 25.07, tc: 0.13, camber: 0,
    fuselageCrossSection: 128.2, baseArea: 0.01, fuselageDiameterToSpan: 0.15 + d, fuselageLengthToDiameter: 10.12345,
    components: one, design: { clDesign: 0.5, machDesign: 0.8 - d } });
  const c = mach.map((m) => p.evaluate(m, 0.5, 2.6, 390).compressibility);
  const worst = Math.max(...c.map((v, i) => Math.abs(v - ec[i])));
  check("compressibility drag, M 0.2-1.1 through both table sets (within the 8-digit printout)", worst < 5e-9,
        `worst |Δ| ${worst.toExponential(1)}`);
  /* compressibility_drag.py: the wing term carries (1 + 0.1 CAM). */
  const wingOnly = (camber) => makeFlopsPolar({ wingArea: 1370, taper: 0.432, aspectRatio: 11.5, sweepDeg: 25.07, tc: 0.13,
    camber, components: one, design: { clDesign: 0.5, machDesign: 0.8 } });
  check("wing compressibility scales with (1 + 0.1 · camber), below and above ΔM 0.05",
        [0.8, 0.9].every((m) => rel(wingOnly(1).evaluate(m, 0.5, 2.6, 390).compressibility
                                   / wingOnly(0).evaluate(m, 0.5, 2.6, 390).compressibility, 1.1) < 1e-12));

  /* test_induced_drag.py uses forward sweep, but induced_drag.py takes
     tan(Λ / scipy.constants.degree), i.e. degrees × 180/π, and its expected
     values carry that (reproduced to 7 digits by evaluating the code as
     written). Here Λ is converted to radians, so the forward-sweep term is
     checked against the same equation written out independently, and the
     DeYoung span-efficiency reduction is checked with the sweep term off. */
  const induced = (g) => {
    const p = makeFlopsPolar({ wingArea: 1370, tc: 0.12, components: one, aspectRatio: 11.05, design: { clDesign: 0.5, machDesign: 0.8 }, ...g });
    return M.map((m, i) => p.evaluate(m, CL[i], 2.6, 390).induced);
  };
  const warnerRobins = (sw, tr, e) => M.map((m, i) => {
    const AR = 11.05, th = (1 - tr) / (1 + tr) / AR, t = Math.tan(sw * Math.PI / 180);
    const ca = 1 / Math.hypot(1, t - 3 * th), cb = 1 / Math.hypot(1, t + th);
    const k = 0.5 * ((1.1 - 0.11 / (1.1 - m * ca)) / (1.1 - 0.11 / (1.1 - m * cb)) - 1) ** 2;
    return CL[i] ** 2 / (Math.PI * AR * e) + k * CL[i] ** 2;
  });
  const i1 = induced({ sweepDeg: -25.03, taper: 0.278, spanEfficiency: 0.7 });
  check("forward sweep adds the Warner Robins term (sweep in radians)", maxRel(i1, warnerRobins(-25.03, 0.278, 0.7)) < 1e-6,
        `M 0.85: ${i1[5].toFixed(6)} (Aviary's degree slip gives 0.012448)`);
  const e0 = 1 + 0.1 * 11.05 * (0.4226 * Math.sqrt(11.05) - 0.35 * 0.312 - 0.143);
  const i2 = induced({ sweepDeg: 25.10, taper: 0.312, spanEfficiency: 0.528, spanEfficiencyReduction: true });
  check("DeYoung span-efficiency reduction: e = e₀(AR, λ) · E",
        maxRel(i2, CL.map((c) => c * c / (Math.PI * 11.05 * e0 * 0.528))) < 1e-12, `e₀ = ${e0.toFixed(4)}`);
  /* induced_drag.py: a FLOPS E of 0.3 or less is added to e₀, not multiplied. */
  const i3 = induced({ sweepDeg: 25, taper: 0.3, spanEfficiency: 0.2 });
  check("span efficiency input E ≤ 0.3 is an increment: E = 0.2 gives e = 1.2",
        rel(i3[0], 0.3 * 0.3 / (Math.PI * 11.05 * 1.2)) < 1e-12);
}

console.log("\n5. Whole polar against FLOPS (test_computed_aero_group.py)");
const CASES = [
  { name: "large_single_aisle_1", tol134: 0.004, P: 374.74437747, T: 389.97,
    mach: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.775, 0.8, 0.825, 0.85, 0.875],
    CL: [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85],
    geom: { S: 1370, AR: 11.22091, tc: 0.13, glove: 134, sweep: 25, taper: 0.278, camber: 0, E: 1, aitek: 1.92669766647637, maxMach: 0.785,
            ht: [355, 6, 0.125], vt: [284, 1.75, 0.1195], fusL: 128, fusD: (13.17 + 12.33) / 2, nac: [12.3, 7.94], nEng: 2,
            wet: { wing: 2396.56, horizontalTail: 592.65, verticalTail: 581.13, fuselage: 4158.62, nacelles: 2 * 273.45 }, lam: {} },
    data: [
      [0.02825, 0.02849, 0.02901, 0.02981, 0.03089, 0.03223, 0.03381, 0.03549, 0.03752, 0.04006, 0.04270, 0.04548, 0.04861, 0.05211, 0.05600],
      [0.02637, 0.02662, 0.02714, 0.02794, 0.02901, 0.03035, 0.03193, 0.03361, 0.03564, 0.03819, 0.04082, 0.04361, 0.04674, 0.05024, 0.05412],
      [0.02509, 0.02533, 0.02585, 0.02665, 0.02773, 0.02907, 0.03065, 0.03233, 0.03436, 0.03690, 0.03954, 0.04232, 0.04545, 0.04895, 0.05284],
      [0.02412, 0.02434, 0.02485, 0.02565, 0.02674, 0.02808, 0.02965, 0.03133, 0.03336, 0.03590, 0.03854, 0.04132, 0.04445, 0.04795, 0.05184],
      [0.02351, 0.02370, 0.02420, 0.02500, 0.02611, 0.02745, 0.02900, 0.03068, 0.03272, 0.03524, 0.03788, 0.04067, 0.04380, 0.04730, 0.05118],
      [0.02350, 0.02362, 0.02408, 0.02489, 0.02604, 0.02741, 0.02890, 0.03057, 0.03261, 0.03512, 0.03776, 0.04054, 0.04368, 0.04717, 0.05106],
      [0.02367, 0.02373, 0.02417, 0.02498, 0.02617, 0.02754, 0.02900, 0.03066, 0.03270, 0.03517, 0.03781, 0.04065, 0.04393, 0.04766, 0.05186],
      [0.02392, 0.02394, 0.02436, 0.02518, 0.02639, 0.02777, 0.02920, 0.03084, 0.03288, 0.03532, 0.03804, 0.04132, 0.04533, 0.05011, 0.05570],
      [0.02450, 0.02443, 0.02481, 0.02563, 0.02690, 0.02833, 0.02977, 0.03140, 0.03349, 0.03612, 0.03970, 0.04440, 0.04951, 0.05510, 0.06116],
      [0.02600, 0.02567, 0.02592, 0.02677, 0.02819, 0.02984, 0.03152, 0.03357, 0.03637, 0.04049, 0.04542, 0.05088, 0.05801, 0.06656, 0.07652],
      [0.02926, 0.02811, 0.02800, 0.02891, 0.03084, 0.03348, 0.03664, 0.04043, 0.04577, 0.05245, 0.05885, 0.06547, 0.07224, 0.07924, 0.08650],
      [0.04705, 0.04397, 0.04294, 0.04394, 0.04697, 0.05224, 0.05984, 0.06647, 0.07918, 0.09321, 0.09807, 0.10514, 0.11100, 0.11651, 0.12197]] },
  { name: "advanced_single_aisle (N3CC)", tol134: 0.005, P: 340.53, T: 389.97,
    mach: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.775, 0.8, 0.825, 0.85],
    CL: [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9],
    geom: { S: 1220, AR: 11.5587605382765, tc: 0.12233, glove: 0, sweep: 23.6286942529271, taper: 0.265189599754917, camber: 0.015,
            E: 0.95, aitek: 1.6, maxMach: 0.785,
            ht: [349.522730527158, 5.22699386503068, 0.115], vt: [227.184358191707, 1.77777777777778, 0.1],
            fusL: 125, fusD: (13 + 12.3) / 2, nac: [35, 7.2], nEng: 2,
            wet: { wing: 2210.280228, horizontalTail: 576.571192, verticalTail: 445.645658, fuselage: 4235.082096, nacelles: 2 * 244.468282 },
            lam: { wing: { upper: 58 }, horizontalTail: { upper: 29 }, verticalTail: { upper: 29, lower: 29 } } },
    data: [
      [0.02494, 0.02544, 0.02621, 0.02727, 0.02859, 0.03015, 0.03191, 0.03381, 0.03632, 0.03901, 0.04175, 0.04483, 0.04825, 0.05205, 0.05621],
      [0.02325, 0.02375, 0.02453, 0.02558, 0.02690, 0.02847, 0.03022, 0.03213, 0.03464, 0.03733, 0.04006, 0.04315, 0.04657, 0.05037, 0.05452],
      [0.02212, 0.02261, 0.02339, 0.02444, 0.02577, 0.02733, 0.02908, 0.03099, 0.03350, 0.03618, 0.03892, 0.04201, 0.04542, 0.04922, 0.05338],
      [0.02125, 0.02173, 0.02250, 0.02357, 0.02491, 0.02646, 0.02820, 0.03011, 0.03261, 0.03530, 0.03804, 0.04112, 0.04454, 0.04834, 0.05250],
      [0.02084, 0.02130, 0.02208, 0.02316, 0.02451, 0.02604, 0.02776, 0.02969, 0.03218, 0.03487, 0.03761, 0.04069, 0.04411, 0.04791, 0.05207],
      [0.02087, 0.02127, 0.02203, 0.02316, 0.02457, 0.02605, 0.02772, 0.02967, 0.03213, 0.03482, 0.03756, 0.04065, 0.04407, 0.04788, 0.05204],
      [0.02115, 0.02152, 0.02228, 0.02343, 0.02486, 0.02632, 0.02795, 0.02991, 0.03233, 0.03501, 0.03803, 0.04171, 0.04606, 0.05113, 0.05689],
      [0.02160, 0.02192, 0.02268, 0.02386, 0.02535, 0.02681, 0.02842, 0.03038, 0.03291, 0.03596, 0.04024, 0.04509, 0.05057, 0.05668, 0.06342],
      [0.02274, 0.02293, 0.02366, 0.02494, 0.02659, 0.02820, 0.03004, 0.03244, 0.03596, 0.04066, 0.04560, 0.05224, 0.06038, 0.07001, 0.08114],
      [0.02516, 0.02493, 0.02561, 0.02720, 0.02954, 0.03219, 0.03543, 0.03964, 0.04534, 0.05181, 0.05827, 0.06510, 0.07228, 0.07984, 0.08776],
      [0.03957, 0.03827, 0.03877, 0.04108, 0.04524, 0.05136, 0.05820, 0.06586, 0.08233, 0.08717, 0.09438, 0.10072, 0.10656, 0.11240, 0.11803]] },
  { name: "large_single_aisle_2", tol134: 0.005, P: 374.74437747, T: 389.97,
    mach: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.775, 0.8, 0.825, 0.85],
    CL: [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8],
    geom: { S: 1341, AR: 9.45, tc: 0.131732727515702, glove: 0, sweep: 25.03, taper: 0.237343146184852, camber: 0.015,
            E: 1.35, aitek: 1.87, maxMach: 0.82,
            ht: [407.335370699457, 5.444, 0.1195], vt: [284.499779284585, 2.2262, 0.137459440381375],
            fusL: 124.75, fusD: (13.0208 + 12.33) / 2, nac: [11.65, 7.0], nEng: 2,
            wet: { wing: 2423.02, horizontalTail: 707.706, verticalTail: 589.35, fuselage: 4142.317, nacelles: 2 * 228.34 },
            lam: { wing: { upper: 10, lower: 10 }, horizontalTail: { upper: 10, lower: 10 }, verticalTail: { upper: 10, lower: 10 } } },
    data: [
      [0.02748, 0.02748, 0.02777, 0.02834, 0.02919, 0.03031, 0.03167, 0.03308, 0.03476, 0.03721, 0.03983, 0.04278, 0.04609, 0.04996, 0.05461],
      [0.02562, 0.02562, 0.02591, 0.02648, 0.02733, 0.02845, 0.02982, 0.03122, 0.03290, 0.03536, 0.03797, 0.04093, 0.04423, 0.04810, 0.05276],
      [0.02435, 0.02436, 0.02465, 0.02521, 0.02606, 0.02718, 0.02855, 0.02995, 0.03164, 0.03409, 0.03671, 0.03966, 0.04296, 0.04683, 0.05149],
      [0.02338, 0.02338, 0.02366, 0.02423, 0.02508, 0.02620, 0.02757, 0.02898, 0.03067, 0.03310, 0.03572, 0.03867, 0.04198, 0.04585, 0.05050],
      [0.02276, 0.02275, 0.02303, 0.02359, 0.02446, 0.02557, 0.02693, 0.02835, 0.03007, 0.03246, 0.03509, 0.03804, 0.04134, 0.04521, 0.04987],
      [0.02279, 0.02269, 0.02293, 0.02350, 0.02441, 0.02555, 0.02685, 0.02829, 0.03002, 0.03235, 0.03499, 0.03794, 0.04124, 0.04511, 0.04977],
      [0.02297, 0.02282, 0.02303, 0.02360, 0.02454, 0.02571, 0.02699, 0.02843, 0.03016, 0.03241, 0.03502, 0.03803, 0.04140, 0.04537, 0.05014],
      [0.02328, 0.02306, 0.02323, 0.02380, 0.02478, 0.02598, 0.02724, 0.02868, 0.03042, 0.03260, 0.03512, 0.03860, 0.04232, 0.04671, 0.05204],
      [0.02399, 0.02360, 0.02370, 0.02428, 0.02533, 0.02662, 0.02789, 0.02933, 0.03129, 0.03403, 0.03737, 0.04141, 0.04587, 0.05069, 0.05587],
      [0.02567, 0.02496, 0.02490, 0.02548, 0.02670, 0.02821, 0.02970, 0.03157, 0.03426, 0.03794, 0.04203, 0.04630, 0.05183, 0.05791, 0.06470],
      [0.04212, 0.04044, 0.03992, 0.04052, 0.04226, 0.04476, 0.04771, 0.05158, 0.05638, 0.06166, 0.06690, 0.07238, 0.07763, 0.08296, 0.08858]] },
];

function casePolar(c) {
  const g = c.geom;
  const components = flopsComponents({ wingArea: g.S, wingAspectRatio: g.AR, wingTc: g.tc, glove: g.glove,
    htArea: g.ht[0], htAspectRatio: g.ht[1], htTc: g.ht[2], vtArea: g.vt[0], vtAspectRatio: g.vt[1], vtTc: g.vt[2],
    fuselageLength: g.fusL, fuselageRefDiameter: g.fusD, nacelleLength: g.nac[0], nacelleDiameter: g.nac[1],
    numEngines: g.nEng, wetted: g.wet, laminar: g.lam });
  return makeFlopsPolar({ wingArea: g.S, aspectRatio: g.AR, taper: g.taper, sweepDeg: g.sweep, tc: g.tc, camber: g.camber,
    spanEfficiency: g.E, airfoilTech: g.aitek, maxMach: g.maxMach,
    fuselageCrossSection: Math.PI * (g.fusD / 2) ** 2, fuselageLengthToDiameter: g.fusL / g.fusD,
    fuselageDiameterToSpan: g.fusD / Math.sqrt(g.AR * (g.S - g.glove)), components });
}

for (const c of CASES) {
  const polar = casePolar(c);
  const got = [], want = [];
  c.mach.forEach((M, i) => c.CL.forEach((cl, j) => { got.push(polar.cd(M, cl, c.P, c.T)); want.push(c.data[i][j]); }));
  const all = normRel(got, want), first = normRel(got.slice(0, 134), want.slice(0, 134));
  const worstLow = maxRel(got.slice(0, 134), want.slice(0, 134));
  check(`${c.name}: ${got.length} points, ‖Δ‖/‖FLOPS‖ ≤ 5 %; first 134 ≤ ${(c.tol134 * 100).toFixed(1)} %`,
        all <= 0.05 && first <= c.tol134,
        `${(all * 100).toFixed(2)} %, ${(first * 100).toFixed(2)} %; worst single point in the first 134 ${(worstLow * 100).toFixed(2)} %`);
}
{
  /* The components as Aviary's geometry lists them for LSA1 (FLOPS outputs). */
  const comps = casePolar(CASES[0]).components;
  const exp = [["wing", 10.49, 0.13], ["horizontal tail", 7.69, 0.125], ["vertical tail", 12.74, 0.1195],
               ["fuselage", 128, 10.0392], ["nacelle", 12.3, 1.5491], ["nacelle", 12.3, 1.5491]];
  check("LSA1 characteristic lengths and fineness ratios match FLOPS's printout",
        comps.length === 6 && exp.every(([n, L, f], i) => comps[i].name === n && Math.abs(comps[i].length - L) < 0.006
                                                        && Math.abs(comps[i].fineness - f) < 0.00006));
}

console.log("\n6. The drag method in sizing and in the mission");
{
  const G = 9.80665, LBF = 4.4482216;
  /* A polar handed to the mission as a function flies the same mission as
     the same parabola handed over as CD0 and k (holding: golden-section
     minimum-drag CL against the exact one). */
  const par = { S: 124.6, cd0: 0.018, k: 1 / (Math.PI * 9.45 * 0.85) };
  const fn = { S: par.S, cd: (M, CL) => par.cd0 + par.k * CL * CL };
  const e = { F0: 2 * 27300 * LBF, tsfcCruise: 0.56, climbThrottle: 0.95 };
  const m = { rangeNm: 2000, cruiseAltFt: 35000, cruiseMach: 0.785, climbCasKt: 290, descentCasKt: 290, taxiMin: 10,
              takeoffFuelFraction: 0.004, reserve: "us-flag", alternateNm: 200, alternateAltFt: 25000, alternateMach: 0.7 };
  const r1 = flyMission(par, e, m, 79000 * G), r2 = flyMission(fn, e, m, 79000 * G);
  check("a polar given as CD(M, CL, h) flies the parabolic mission it describes, holding included",
        rel(r2.trip, r1.trip) < 1e-12 && rel(r2.segments.final, r1.segments.final) < 1e-8,
        `hold fuel ${(r2.segments.final / G).toFixed(3)} vs ${(r1.segments.final / G).toFixed(3)} kg`);
  /* The polar really varies along the mission: 0.002 more drag above M 0.6
     costs trip fuel and cruise L/D and barely touches the slow hold. (The
     cruise leg itself burns less: the longer climb leaves less of it.) */
  const bumped = { S: par.S, cd: (M, CL) => par.cd0 + par.k * CL * CL + (M > 0.6 ? 0.002 : 0) };
  const r3 = flyMission(bumped, e, m, 79000 * G);
  check("the mission evaluates the polar at each segment's own Mach",
        r3.trip > r1.trip && r3.distances.climb > r1.distances.climb
        && rel(r3.segments.final, r1.segments.final) < 0.02 && r3.cruiseLD < r1.cruiseLD);

  const cf = sizeTransport({}), fl = sizeTransport({ dragMethod: "flops" });
  const b = fl.cruise.breakdown;
  check("FLOPS drag sizes the default aircraft; cruise CD is the build-up at the cruise CL",
        fl.converged && fl.cruise.dragMethod === "flops" && cf.cruise.dragMethod === "equivalent-cf"
        && rel(fl.cruise.cd, b.cd) < 1e-12 && rel(fl.cruise.Estart, fl.cruise.cl / fl.cruise.cd) < 1e-12
        && rel(b.cd, b.cd0 + b.cdi) < 1e-12 && fl.grossLb !== cf.grossLb,
        `L/D ${fl.cruise.E.toFixed(2)} (cf ${cf.cruise.E.toFixed(2)}); CD0 ${b.cd0.toFixed(5)}, CDi ${b.cdi.toFixed(5)}`);
  const aft = sizeTransport({ dragMethod: "flops", engineLocation: "aft-fuselage", cruiseMach: 0.82 });
  check("the aft-nacelle increment is added to the build-up",
        rel(aft.cruise.cd - aft.cruise.breakdown.cd, aftNacelleDeltaCd("aft-fuselage", 0.82)) < 1e-9
        && aftNacelleDeltaCd("aft-fuselage", 0.82) > 0);
  check("the best L/D is the maximum of CL/CD at cruise Mach and height",
        fl.cruise.eMax >= fl.cruise.E && fl.cruise.clMd > 0.3 && fl.cruise.clMd < 0.9);
  const mc = sizeTransport({ fuelMethod: "mission" }), mf = sizeTransport({ fuelMethod: "mission", dragMethod: "flops" });
  check("the segment mission flies the FLOPS polar", mf.converged && mf.fuel.mission.cruiseLD !== mc.fuel.mission.cruiseLD
        && Math.abs(mf.fuel.mission.cruiseLD - fl.cruise.E) < 1.5, `mission cruise L/D ${mf.fuel.mission.cruiseLD.toFixed(2)}`);
  const ax = { grossLb: 174200, wingAreaFt2: 1341, thrustEachLbf: 27301, fuelCapacityLb: 46063 };
  const ac = analyzeTransport({ ...ax, fuelMethod: "mission" }), af = analyzeTransport({ ...ax, fuelMethod: "mission", dragMethod: "flops" });
  check("analysis of an existing aircraft uses the drag method too",
        af.cruise.dragMethod === "flops" && af.rangeNm > 0 && af.rangeNm !== ac.rangeNm,
        `737-800 range ${af.rangeNm.toFixed(0)} nm (cf ${ac.rangeNm.toFixed(0)} nm)`);
  check("the sized polar uses the span-efficiency input: CDi = CL²/(π A · 1.35)",
        rel(b.induced, fl.cruise.cl ** 2 / (Math.PI * 9.45 * 1.35)) < 1e-12);
  const lo = analyzeTransport({ ...ax, dragMethod: "flops", cruiseAltFt: 25000 });
  const hi = analyzeTransport({ ...ax, dragMethod: "flops", cruiseAltFt: 39000 });
  check("the polar is evaluated at the flight condition: thinner air, lower Reynolds number, more skin friction",
        hi.cruise.breakdown.skinFriction > lo.cruise.breakdown.skinFriction * 1.03,
        `CDF ${lo.cruise.breakdown.skinFriction.toFixed(5)} at 25,000 ft, ${hi.cruise.breakdown.skinFriction.toFixed(5)} at 39,000 ft`);
  let threw = false; try { sizeTransport({ dragMethod: "cfd" }); } catch { threw = true; }
  check("an unknown drag method is refused", threw);
  check("FLOPS drag inputs default to the 737-800 deck (AITEK 1.87, CAM 0.015, E 1.35)",
        TRANSPORT_INPUTS.airfoilTech.value === 1.87 && TRANSPORT_INPUTS.wingCamber.value === 0.015
        && TRANSPORT_INPUTS.spanEfficiencyFlops.value === 1.35 && TRANSPORT_INPUTS.dragMethod.value === "equivalent-cf");
}

console.log("");
console.log(fail ? `TRANSPORT DRAG GATE FAILED: ${fail} check(s)` : `TRANSPORT DRAG GATE PASSED (${pass} checks)`);
process.exit(fail ? 1 : 0);
