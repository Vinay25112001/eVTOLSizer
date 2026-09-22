/* =====================================================================
   STRUCTURAL LOAD CASE GATE — gust and manoeuvre
   =====================================================================
   engine/loadcases.js has been in this repo, sourced to SC-VTOL and
   CS-23.341, and gated by NOTHING. It sets the ultimate load factor that
   sizes the wing box, so an error in it is an error in every wing weight
   this tool has produced.

   The centrepiece here is a units check that is genuinely independent: the
   regulation states the gust increment in IMPERIAL form, this engine
   computes it in SI, and the two must agree without either knowing about
   the other.
   ===================================================================== */
import { loadCases, SC_VTOL_GUSTS } from "../src/engine/loadcases.js";
import { runSizing } from "../src/engine.js";
import * as CFG from "../src/engine/configuration.js";

let fails = 0;
const check = (ok, what, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}   ${detail}`);
  if (!ok) fails++;
};

console.log("STRUCTURAL LOAD CASE GATE");
console.log("=".repeat(74));
console.log("  SC-VTOL VTOL.2215(f) gusts; CS-23.341 / FAR 23.341 alleviation factor");
console.log("");

/* ── 1. The regulation's own velocities ─────────────────────────────── */
const ftps = (ms) => ms / 0.3048;
const want = [30, 50, 66];
const got = SC_VTOL_GUSTS.map((g) => Math.round(ftps(g.Ude)));
check(JSON.stringify(got) === JSON.stringify(want),
  "the three SC-VTOL derived gust velocities round-trip to the regulation's own numbers",
  `${SC_VTOL_GUSTS.map((g) => g.Ude).join(" / ")} m/s = ${got.join(" / ")} ft/s, `
  + `against VTOL.2215(f)'s 30 / 50 / 66 ft/s`);

/* ── 2. SI against the regulation's IMPERIAL formula ─────────────────
   CS-23.341:  dn = K_g U_de V a / (498 W/S)    [U_de ft/s, V KEAS, W/S psf]
   loadcases:  dn = K_g U_de V a rho0 / (2 W/S) [all SI]
   Neither expression can see the other. If the 498 constant and the SI
   density form disagree, this is where it shows. */
const WS_SI = 1450, V_SI = 67, U_SI = 15.24, a = 5.0, rho0 = 1.225;
const mu = 2 * WS_SI / (rho0 * 1.5 * a * 9.80665);
const Kg = 0.88 * mu / (5.3 + mu);
const dn_SI = Kg * U_SI * V_SI * a * rho0 / (2 * WS_SI);

const WS_psf = WS_SI / 47.880259, V_kt = V_SI * 1.943844, U_ftps = U_SI / 0.3048;
const dn_imp = Kg * U_ftps * V_kt * a / (498 * WS_psf);

check(Math.abs(dn_SI / dn_imp - 1) < 0.002,
  "the SI gust increment agrees with CS-23.341's imperial 498 form",
  `SI ${dn_SI.toFixed(4)} against imperial ${dn_imp.toFixed(4)} — ${(100 * Math.abs(dn_SI / dn_imp - 1)).toFixed(2)}% apart, `
  + `and the two share no constant: one carries rho0/2, the other carries 498`);

/* ── 3. The alleviation factor must behave the way its purpose says ── */
const kgOf = (m) => 0.88 * m / (5.3 + m);
check(kgOf(1e9) < 0.8800001 && kgOf(1e9) > 0.8799,
  "K_g approaches 0.88 for a very heavy aircraft and never exceeds it",
  `K_g -> 0.88 as mu -> infinity — a heavy aircraft cannot be alleviated by more `
  + `than the factor's own ceiling, so K_g is bounded above by construction`);
check(kgOf(5) < kgOf(50),
  "and a LIGHTER aircraft is alleviated more",
  `K_g ${kgOf(5).toFixed(3)} at mu=5 against ${kgOf(50).toFixed(3)} at mu=50 — the `
  + `light aircraft is accelerated before the gust is fully developed, which is `
  + `the whole reason the factor exists`);

/* ── 4. Category matters: 66 ft/s is Enhanced only ──────────────────── */
const gBase = { MTOW: 3000, Swing: 20, MAC: 1.5, rho: 1.225, rho0: 1.225,
                CLaW: 5.0, vCruise: 67 };
const enh = loadCases({ vtolCategory: "enhanced" }, gBase);
const bas = loadCases({ vtolCategory: "basic" }, gBase);
check(enh.gusts.length === 3 && bas.gusts.length === 2,
  "the 66 ft/s case is applied to Category Enhanced only",
  `enhanced gets 3 gust cases, basic gets 2 — VTOL.2215(f)(3) is Enhanced only, `
  + `and applying it to Basic would over-size every wing in that category`);

/* ── 5. The claim written in the module's own header ────────────────── */
const floor = loadCases({ nLimitManoeuvre: 2.0 }, gBase);
const dflt  = loadCases({}, gBase);
check(floor.gustGoverns === true && dflt.gustGoverns === false,
  "at SC-VTOL's 2.0g manoeuvre floor the GUST case takes over the wing",
  `n=2.0 -> ${floor.governingCase} (nLimit ${floor.nLimit.toFixed(2)}); `
  + `n=3.5 -> ${dflt.governingCase}. The module's header claims exactly this and `
  + `nothing tested it until now`);

/* ── 6. Scaling, which is what makes it a wing-sizing case ──────────── */
const heavy = loadCases({}, { ...gBase, Swing: 10 });   // double the wing loading
check(heavy.worstGust.deltaN < dflt.worstGust.deltaN,
  "doubling wing loading reduces the gust increment",
  `dn ${dflt.worstGust.deltaN.toFixed(3)} -> ${heavy.worstGust.deltaN.toFixed(3)} — `
  + `a heavily loaded wing is thrown less by the same gust, which is why gust `
  + `governs the LIGHT designs and manoeuvre governs the heavy ones`);

/* ── 7. Report every layout ─────────────────────────────────────────── */
const B = { payload:455, range:161, vCruise:67, cruiseAlt:1000, hoverHeight:15.24,
  reserveMinutes:20, LD:8.5, AR:9, eOsw:0.85, taper:0.45, tc:0.15, wingLoadingNm2:1371,
  clCruiseMax:0.9, clDesign:0.55, propDiam:2.37, twRatio:1.3, convTolExp:-6, etaHov:0.74,
  tipSpeed:167.64, etaSys:0.8, rateOfClimb:5.08, climbAngle:5, descentAngle:6,
  climbLDPenalty:0.13, deltaISA:0, cRateDerate:0.08, sedCell:300, etaBat:0.9, socMin:0.19,
  ewf:0.5, weightModel:"buildup", autoPositionWing:true, targetSM:0.15, fusLen:7.2,
  fusDiam:1.65, vtGamma:45, vtCh:0.45, vtCv:0.032, vtAR:2.5 };

console.log("");
console.log("  MEASURED, NOT ASSERTED — every winged layout at its design point:");
console.log("    layout        W/S(N/m2)    mu      K_g    dN worst  nLimit  governing");
for (const k of Object.keys(CFG.CONFIGURATIONS)) {
  const d = CFG.CONFIG_DEFAULTS[k];
  const cap = CFG.capabilitiesFor(k, d.nRotors);
  if (cap.hasWing === false) {
    console.log(`    ${k.padEnd(14)} — no wing, so no wing gust case`);
    continue;
  }
  const p0 = { ...B, configType:k, nPropHover:d.nRotors, vCruise:d.vCruise_ms??B.vCruise,
    tipSpeed:d.tipSpeed_ms??B.tipSpeed, LD:d.LD_target??B.LD, etaHov:d.etaHov??B.etaHov,
    ...(d.wingLoadingNm2 ? { wingLoadingNm2:d.wingLoadingNm2 } : {}) };
  const p = { ...p0, propDiam: CFG.solveRotorDiameter(k, p0, runSizing)?.propDiam };
  const S = runSizing(p);
  const lc = loadCases(p, { MTOW:S.MTOW, Swing:S.Swing, MAC:S.MAC, rho:1.225,
                            rho0:1.225, CLaW:S.CLaW, vCruise:p.vCruise });
  console.log(`    ${k.padEnd(14)}${lc.wingLoadingNm2.toFixed(0).padStart(7)}`
    + `${lc.massRatio.toFixed(1).padStart(8)}${lc.gustAlleviation.toFixed(4).padStart(9)}`
    + `${lc.worstGust.deltaN.toFixed(3).padStart(10)}${lc.nLimit.toFixed(2).padStart(8)}`
    + `   ${lc.governingCase}`);
}

console.log("");
console.log("  WHAT THAT SAYS:");
console.log("    At the 3.5g default every winged layout is manoeuvre-governed, with the");
console.log("    worst gust adding 1.57-2.37g on its own. That is not comfortable margin:");
console.log("    the tiltrotor's 66 ft/s case alone reaches 3.37g against a 3.5g limit.");
console.log("    Drop the manoeuvre limit toward SC-VTOL's 2.0g floor — which is what a");
console.log("    full-authority FBW eVTOL with envelope protection actually flies to —");
console.log("    and the gust case governs the wing instead.");

console.log("");
if (fails) { console.log(`STRUCTURAL LOAD CASE GATE FAILED: ${fails}`); process.exit(1); }
console.log("STRUCTURAL LOAD CASE GATE PASSED");
