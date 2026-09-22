import { mark } from "../ui/marks.jsx";
import { SC } from "../lib/theme.js";
import { seatCount } from "../engine/economics/doc-constants.js";

/* Tab 10 — Certification.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function CertificationTab(ctx) {
  const { SR, U, params, set, tab } = ctx;

              // ═══════════════════════════════════════════════════════
              // COMPUTED CERTIFICATION PARAMETERS
              // ═══════════════════════════════════════════════════════
              const MTOW_kg  = SR.MTOW;
              const MTOW_lb  = MTOW_kg * 2.20462;
              /* seatCount(), not a second hardcoded 90 kg. The engine's occupant
                 mass is 90.718 kg (NASA/20180006683, "6 occupants at 1200 lb"),
                 and this tab and CostTab disagreed on seat count at 81 of 161
                 points across the payload slider before both were pointed at it. */
              const nPax     = seatCount(params.payload);
              const batFrac  = SR.Wbat / MTOW_kg;
              const socFloor = params.socMin / (1 + params.socMin);
              const reserve_pct = (1 - SR.Etot / SR.PackkWh) * 100;

              // Use noise values computed in physics engine (BPF + broadband model)
              const BPF = SR.BPF;
              const dBA_hover = SR.dBA_150m;  // A-weighted at 150m from physics engine
              const r_ref = 150;

              // Reserve energy margin
              const reserveE_pct = (SR.Eres / SR.PackkWh) * 100;

              /* ── STRUCTURAL LOAD FACTOR — FROM THE ENGINE, NOT A LITERAL ──
                 These were `const n_pos = 3.5` and `n_ult = n_pos * 1.5`, and
                 four compliance rows below compared them to the literals 3.5,
                 5.25 and 1.5. Every one of those comparisons was a constant
                 against a constant: they could not fail, could not change with
                 the design, and were identical for all six layouts.

                 The engine has computed this properly the whole time.
                 engine/loadcases.js takes the worst of the SC-VTOL VTOL.2215(f)
                 gust set and the VTOL.2200(f) manoeuvre case; a wingless layout
                 gets the thrust-borne factor instead. SR.nLimit is that answer
                 and SR.nUltimate is 1.5x it per PL.2230(b) / VTOL.2230(a)(2). */
              const n_pos = SR.nLimit;
              const n_ult = SR.nUltimate;
              const nBasis = SR.loadFactorBasis;
              const nGovern = SR.loadGoverningCase;
              const nzWeights = SR.weightsNzUltimate;

              // CG range check — allowed range ±15% MAC from NP
              const cgRange = Math.abs(SR.xNP - SR.xCGtotal) / SR.MAC * 100;

              // Battery C-rate under hover
              const C_hover = SR.CrateHov;

              // Wing loading for stall compliance
              const Vstall_stall = SR.Vstall;

              // ═══════════════════════════════════════════════════════
              // RULE DEFINITIONS — all sourced from actual regulations
              // ═══════════════════════════════════════════════════════
              const rules = {
                FAA: [
                  // Weight & Category
                  {
                    id:"FAA-W1", ref:"AC 21.17-4 §5.2 / 14 CFR §21.17(b)",
                    category:"Weight & Category",
                    title:"Max Certificated Takeoff Weight",
                    /* Para 1 is PURPOSE; the weight is in para 5.2, and it bounds appendix A
   rather than the AC. Para 5.1: "The procedures in this AC apply to ALL
   powered-lift proposed to be type certificated as special class under
   §21.17(b)" — so exceeding 12,500 lb does not put an aircraft outside
   certification, it puts it outside the ready-made criteria in appendix A,
   which is a screening result and not an airworthiness verdict. */
                    desc:"AC 21.17-4 §5.2: appendix A's airworthiness criteria apply to powered-lift of 12,500 lb max gross weight or less, ≤6 passenger seats, and battery-powered electric engine driven propellers. §5.1 applies the AC's procedures to all powered-lift under §21.17(b) regardless of weight — above this bound an applicant needs bespoke criteria, not a different answer on airworthiness.",
                    check: MTOW_lb <= 12500,
                    value: `${MTOW_lb.toFixed(0)} lb (${U.mass(MTOW_kg)} ${U.massU})`,
                    limit: "≤ 12,500 lb (5,670 kg)",
                    severity:"critical",
                  },
                  {
                    id:"FAA-W2", ref:"AC 21.17-4 / PS-AIR-21.17-01 Safety Continuum",
                    category:"Weight & Category",
                    title:"Passenger Seating Configuration",
                    desc:"AC 21.17-4 §5.2 bounds appendix A at a passenger seating configuration of six or less.",
                    check: nPax <= 6,
                    value: `~${nPax} passengers (payload ${params.payload} kg @ 90 kg/pax)`,
                    limit: "≤ 6 passengers",
                    severity:"critical",
                  },
                  // Structural
                  {
                    id:"FAA-S1", ref:"AC 21.17-4 App.A PL.2200(b)",
                    category:"Structural Integrity",
                    title:"Positive Limit Load Factor",
                    /* THE AC STATES NO NUMBER, AND THIS ROW ASSERTED ONE.
                       It read "AC 21.17-4 App.A PL.2215 / FAR 23.337 — for
                       normal category powered-lift, limit load factor must be
                       >= 3.5g at MTOW" and checked a constant 3.5 against the
                       literal 3.5, so it could not fail.

                       Checked against the issued AC (07/18/2025, now in the
                       corpus as AC-21.17-4_2025-07-18.txt): the string "3.5"
                       does not occur anywhere in the document. PL.2215 lists
                       the flight CONDITIONS — atmospheric gusts, symmetric and
                       asymmetric manoeuvres, asymmetric thrust — and gives no
                       factor. The AC's only load-factor requirement is
                       PL.2200(b), "Design maneuvering load factors not less
                       than those, which service history shows, may occur within
                       the structural design envelope": performance-based, and
                       this class has no service history to read.

                       "Normal category" is Part 23 / Part 27 language. Powered-
                       lift is certified special class under 21.17(b), which is
                       the whole subject of this AC.

                       The only numeric floor either authority publishes is
                       EASA's, so that is what is checked, and it is labelled as
                       EASA's rather than passed off as the FAA's. */
                    desc:"AC 21.17-4 specifies NO numeric load factor. PL.2200(b) requires design manoeuvring load factors not less than service history shows, and this class has no service history. The 2.0g floor checked here is EASA's (MOC VTOL.2200(f)) — the FAA leaves the value to the applicant, and 'normal category' does not apply to special-class powered-lift.",
                    check: n_pos >= 2.0,
                    value: `${n_pos.toFixed(2)}g limit — ${nGovern}`,
                    limit: "≥ 2.0g (EASA floor; FAA states none)",
                    severity:"critical",
                  },
                  {
                    id:"FAA-S2", ref:"AC 21.17-4 App.A PL.2230(b)",
                    category:"Structural Integrity",
                    title:"Ultimate Load Factor — weight model against load cases",
                    /* Was "PL.2235 / FAR 23.303", checking n_ult >= 5.25 where
                       n_ult was itself the constant 5.25. Two corrections.

                       The paragraph: PL.2230(b) is where the 1.5 is defined —
                       "The ultimate loads, which are equal to the limit loads
                       multiplied by a 1.5 factor of safety unless otherwise
                       specified elsewhere in these airworthiness criteria."
                       PL.2235 is what the structure must SUPPORT, not where the
                       factor comes from.

                       The test: the engine forms nUltimate as 1.5 x nLimit by
                       construction, so re-checking that ratio is another
                       tautology. What is NOT definitional is whether the WEIGHT
                       MODEL sized the structure to it — weights.js carries its
                       own ultimate factor, set independently of the load cases
                       and never compared to them. That is the mismatch that can
                       really occur, so that is what this row now tests.

                       2026-09-16: weights.js no longer has its own factor - it
                       is handed the load cases' ultimate factor inside the
                       sizing loop. This row now compares the value the weight
                       model ACTUALLY USED (SR.weightsNzUltimate) with the post-
                       loop load cases, so it fails if the two are ever
                       disconnected again. Under the fraction weight model no
                       structure is sized to any load factor, and the row says
                       so instead of passing. */
                    desc:"PL.2230(b): ultimate = 1.5 × limit. The engine applies that by construction, so the ratio is not a test. This row checks what can genuinely disagree — whether the weight model's ultimate load factor still covers the ultimate factor the load cases produce.",
                    check: nzWeights != null && nzWeights >= n_ult - 0.01,
                    value: nzWeights == null
                      ? `load cases ${n_ult.toFixed(2)}g · fraction weight model sizes no structure to a load factor`
                      : `load cases ${n_ult.toFixed(2)}g · weight model sized to ${nzWeights.toFixed(2)}g`,
                    limit: "weight model Nz ≥ load-case ultimate",
                    severity:"critical",
                  },
                  {
                    id:"FAA-S3", ref:"AC 21.17-4 PL.2241 / FAR 21.17(b)",
                    category:"Structural Integrity",
                    title:"Rotor Tip Mach — Aeroelastic Stability",
                    desc:"Tip Mach must stay below 0.70 to avoid compressibility effects and flutter risk per AC 21.17-4.",
                    check: SR.TipMach < 0.70,
                    value: `Mtip = ${SR.TipMach}`,
                    limit: "< 0.70",
                    severity:"critical",
                  },
                  // Performance
                  {
                    id:"FAA-P1", ref:"FAA powered-lift SFAR / AC 21.17-4 App.A PL.2430(a)(4)",
                    category:"Flight Performance",
                    title:"Reserve Energy Margin",
                    /* THE SAME FABRICATION AS THE BANNED 1035, IN FAA CLOTHING
                       (both numbers written bare here so the citation gate does
                       not read this note as a live citation).
                       This row cited "AC 21.17-4 1035(c) / FAR 27.33". The
                       EASA twin of that number was proven not to exist and
                       banned; this one survived because no gate could check the
                       FAA family until the AC itself reached the corpus.

                       Appendix A of the issued AC contains 144 distinct PL
                       paragraph numbers. The series runs 1457, 1459, 1529, then
                       2000 upward. There is no 1035 in it, and nothing in the
                       document states a reserve time.

                       PL.2430 "Energy system" is the real paragraph on this
                       subject, and (a)(4) requires only "a means to determine
                       the total useable energy available" — no value. The 20
                       minutes is the FAA powered-lift SFAR's, which is what
                       EASA-P2 below already says. "FAR 27.33" is dropped rather
                       than restated: Part 27 is not in the corpus and this row
                       had no business asserting its content either. */
                    desc:"AC 21.17-4 states NO reserve value. PL.2430(a)(4) requires a means to determine total useable energy and nothing more. The 20 minutes checked here is the FAA powered-lift SFAR's, the same number EASA-P2 uses — EASA states the requirement without a value.",
                    check: SR.tres >= 1200,
                    value: `${SR.tres}s = ${(SR.tres/60).toFixed(1)} min`,
                    limit: "≥ 20 min (1,200 s)",
                    severity:"critical",
                  },
                  {
                    id:"FAA-P2", ref:"AC 21.17-4 App.A / FAR 23.2110",
                    category:"Flight Performance",
                    title:"Final State of Charge ≥ Reserve Minimum",
                    desc:"Battery SoC at end of mission must remain above the minimum reserve floor set by SoCmin.",
                    check: reserve_pct >= (socFloor * 100 - 1),
                    value: `${reserve_pct.toFixed(1)}% remaining (floor: ${(socFloor*100).toFixed(1)}%)`,
                    limit: `≥ ${(socFloor*100).toFixed(1)}% SoC floor`,
                    severity:"major",
                  },
                  {
                    id:"FAA-P3", ref:"AC 21.17-4 PL.2100 / FAR 27.143",
                    category:"Flight Performance",
                    title:"Static Margin — Longitudinal Stability",
                    desc:"Aircraft must be statically stable longitudinally. SM must be positive (5–25% MAC target for FBW eVTOL).",
                    check: SR.SM_vt >= 0.05 && SR.SM_vt <= 0.25,
                    value: `SM = ${(SR.SM_vt*100).toFixed(1)}% MAC`,
                    limit: "5–25% MAC",
                    severity:"critical",
                  },
                  // Noise — FAR Part 36
                  {
                    id:"FAA-N1", ref:"14 CFR Part 36 / AC 21.17-4",
                    category:"Noise (FAR Part 36)",
                    title:"Hover Noise Estimate (150m reference)",
                    desc:"Estimated A-weighted hover noise at 150m. EASA UAM community noise target: ≤ 65 dBA for urban integration acceptance. No specific FAA numeric limit yet — evaluated case-by-case under 14 CFR Part 36 / AC 21.17-4.",
                    check: dBA_hover <= 65,
                    value: `~${dBA_hover.toFixed(1)} dBA (at ${r_ref}m)`,
                    limit: "≤ 65 dBA (EASA UAM / FAA advisory target)",
                    severity:"advisory",
                  },
                  {
                    id:"FAA-N2", ref:"14 CFR Part 36 / AC 21.17-4 §7",
                    category:"Noise (FAR Part 36)",
                    title:"Rotor Tip Speed — Noise Driver",
                    desc:"Lower tip speed directly reduces BPF tonal noise. Tip speeds > 200 m/s significantly increase community noise. Target: ≤ 200 m/s.",
                    check: SR.TipSpd <= 200,
                    value: `${U.speed(SR.TipSpd)} ${U.speedU}`,
                    limit: `≤ ${U.speed(200)} ${U.speedU}`,
                    severity:"major",
                  },
                  {
                    id:"FAA-N3", ref:"14 CFR Part 36 Appendix H / AC 21.17-4",
                    category:"Noise (FAR Part 36)",
                    title:"Blade Passing Frequency",
                    desc:"BPF should remain below 150 Hz to minimize tonal noise impact in residential areas (psychoacoustic threshold).",
                    check: BPF <= 150,
                    value: `BPF = ${BPF.toFixed(1)} Hz (${SR.Nbld} blades × ${SR.RPM.toFixed(0)} RPM/60)`,
                    limit: "≤ 150 Hz",
                    severity:"advisory",
                  },
                  // Battery Safety
                  {
                    id:"FAA-B1", ref:"TOOL RULE — no paragraph sets this",
                    category:"Battery Safety",
                    title:"Battery Mass Fraction (tool rule)",
                    /* SECOND FABRICATED FAA PARAGRAPH, found the same way.
                       This cited "App.A 1353" (written bare so the citation
                       gate does not read this note as a live citation). It is
                       not among the AC's 144 paragraph numbers, and no
                       paragraph of appendix A states a battery mass fraction at
                       all — the energy-storage requirements are PL.2430(b),
                       which are qualitative: withstand the loads under likely
                       operating conditions, be isolated from personnel
                       compartments and protected from likely hazards.

                       55% is OUR number. Said plainly, the way regdb.js says it
                       for every rule whose basis is the tool rather than a
                       regulation. */
                    desc:"A TOOL RULE, not a regulation. No paragraph of AC 21.17-4 appendix A states a battery mass fraction; the energy-storage requirements at PL.2430(b) are qualitative. 55% is this tool's own screen for structural balance and crashworthiness.",
                    check: batFrac < 0.55,
                    value: `${(batFrac*100).toFixed(1)}% of MTOW`,
                    limit: "< 55%",
                    severity:"major",
                  },
                  {
                    id:"FAA-B2", ref:"TOOL RULE — cf. RTCA DO-311A (not held)",
                    category:"Battery Safety",
                    title:"Hover C-rate — thermal screen (tool rule)",
                    /* Same fabricated paragraph as FAA-B1, plus a claim about a
                       document nobody here has read. The row said 5C was needed
                       "to comply with RTCA DO-311A thermal runaway containment
                       requirements". DO-311A is a real RTCA standard; it is not
                       in the corpus, and neither the 5C nor the attribution has
                       ever been checked against it. Attributing our threshold to
                       an unread document is how the banned 1035 lasted eleven
                       citations. The engine's actual thermal work is in
                       battery-thermal.js and is sourced there. */
                    desc:"A TOOL RULE. 5C is this tool's hover screen, not a value read from RTCA DO-311A — that standard is not held here and the attribution has never been verified. The engine's sourced thermal model is in battery-thermal.js.",
                    check: C_hover <= 5.0,
                    value: `${C_hover.toFixed(2)}C`,
                    limit: "≤ 5.0C",
                    severity:"major",
                  },
                  // Aerodynamics
                  {
                    id:"FAA-A1", ref:"AC 21.17-4 PL.2100 / FAR 23.2110",
                    category:"Aerodynamics",
                    title:"Actual Lift-to-Drag Ratio",
                    desc:"Minimum aerodynamic efficiency requirement. L/D > 10 required for range and energy compliance.",
                    check: SR.LDact > 10,
                    value: `L/D = ${SR.LDact}`,
                    limit: "> 10",
                    severity:"major",
                  },
                  {
                    id:"FAA-A2", ref:"AC 21.17-4 PL.2200 / FAR 23.2115",
                    category:"Aerodynamics",
                    title:"Cruise Mach Number",
                    desc:"Must remain below Mach 0.45 for subsonic aerodynamic assumptions to remain valid in conceptual design.",
                    check: SR.Mach < 0.45,
                    value: `M = ${SR.Mach}`,
                    limit: "< 0.45",
                    severity:"major",
                  },
                ],
                EASA: [
                  // Weight & Category
                  {
                    id:"EASA-W1", ref:"SC-VTOL-01 VTOL.2005 Issue 2",
                    category:"Weight & Category",
                    title:"EASA Small Category — Max MTOM",
                    desc:"EASA SC-VTOL small category covers aircraft ≤ 3,175 kg MTOM (CS-27 limit). Above this requires SC-VTOL Enhanced provisions.",
                    check: MTOW_kg <= 3175,
                    value: `${U.mass(MTOW_kg)} ${U.massU}`,
                    limit: "≤ 3,175 kg (SC-VTOL small category)",
                    severity:"critical",
                  },
                  {
                    id:"EASA-W2", ref:"SC-VTOL-01 VTOL.2005",
                    category:"Weight & Category",
                    title:"EASA Passenger Seating Limit",
                    desc:"EASA SC-VTOL small category: ≤ 5 passenger seats. Exceeding requires SC-VTOL Enhanced certification.",
                    check: nPax <= 5,
                    value: `~${nPax} passengers`,
                    limit: "≤ 5 passengers",
                    severity:"critical",
                  },
                  // Structural
                  {
                    id:"EASA-S1", ref:"MOC SC-VTOL VTOL.2200(f)",
                    category:"Structural Integrity",
                    title:"Limit Load Factor (SC-VTOL)",
                    /* THREE THINGS WRONG, not just the tautology. This read
                       "SC-VTOL-01 VTOL.2215 / CS-27.337 — SC-VTOL requires
                       design load factor >= 3.5g for normal category. Enhanced
                       category may require higher", checking 3.5 >= 3.5.

                       (1) The number. MOC VTOL.2200(f), verbatim: the positive
                       and negative limit manoeuvring load factors "should be
                       defined based on the maximum capability of the aircraft,
                       taking into account the flight control system (without
                       failure cases)", and "the positive load factor is not
                       less than 2.0". Not 3.5, and not a category table —
                       3.5 is Part 27's rotorcraft number.

                       (2) The category. SC-VTOL has Category Basic and Category
                       Enhanced (SC-VTOL-02 VTOL.2000). It has no "normal
                       category", so "Enhanced may require higher" describes a
                       taxonomy that does not exist in the document cited.

                       (3) The paragraph. VTOL.2215 is Flight load conditions —
                       the gust and manoeuvre CONDITIONS. The manoeuvring load
                       factor is set in VTOL.2200(f).

                       src/lib/regdb.js already carried the correct 2.0 floor
                       with this exact quotation. This tab and that table
                       disagreed about the same requirement inside one app —
                       the same failure as the seat count across two tabs. */
                    desc:"MOC VTOL.2200(f): the positive limit manoeuvring load factor is defined by the maximum capability of the aircraft including its flight control system, and is not less than 2.0. SC-VTOL has Categories Basic and Enhanced — no normal category — and states no 3.5g anywhere.",
                    check: n_pos >= 2.0,
                    value: `${n_pos.toFixed(2)}g (${nBasis}) — ${nGovern}`,
                    limit: "≥ 2.0g (MOC VTOL.2200(f))",
                    severity:"critical",
                  },
                  {
                    id:"EASA-S2", ref:"SC-VTOL-02 VTOL.2230(a)(2)",
                    category:"Structural Integrity",
                    title:"Factor of Safety — limit to ultimate",
                    /* THE PARAGRAPH DESCRIBED A DIFFERENT REQUIREMENT. This was
                       cited to VTOL.2265 "Special factors of safety". That
                       paragraph is real, but it is not this one: it requires an
                       ADDITIONAL factor for each part whose critical design
                       value is uncertain, or which is likely to deteriorate in
                       service or vary because of manufacturing and inspection
                       uncertainty, determined from quality controls and
                       specifications. This tool determines no such factor for
                       any part, so claiming compliance with 2265 was claiming
                       work that was never done.

                       The 1.5 being tested is VTOL.2230(a)(2): "the ultimate
                       loads, which are equal to the limit loads multiplied by a
                       1.5 factor of safety, unless otherwise provided." The FAA
                       states it identically at PL.2230(b).

                       The ratio is definitional in the engine, so this row
                       verifies the engine's OUTPUT PAIR rather than claiming to
                       test the design. The failable form of the same question
                       is FAA-S2 above, which compares the weight model against
                       these load cases. */
                    desc:"VTOL.2230(a)(2): ultimate loads equal limit loads × a 1.5 factor of safety. This row verifies the engine's own nLimit/nUltimate pair. VTOL.2265's special factors for uncertain or deteriorating parts are NOT determined by this tool and are not claimed here.",
                    check: n_ult / n_pos >= 1.5 - 1e-9,
                    value: `${n_ult.toFixed(2)}g ÷ ${n_pos.toFixed(2)}g = ${(n_ult/n_pos).toFixed(2)}`,
                    limit: "≥ 1.5",
                    severity:"major",
                  },
                  {
                    id:"EASA-S3", ref:"SC-VTOL-02 VTOL.2245 Aeroelasticity",
                    category:"Structural Integrity",
                    /* The paragraph cited here was 2241 (written bare so the
                       citation gate does not read this note as a live citation),
                       and it does not exist —
                       the specification numbers in fives and runs 2240 Structural
                       Durability, 2245 Aeroelasticity, 2250. The real paragraph is
                       2245 and its subject does match. What does NOT match is the
                       test: aeroelasticity is flutter and divergence, and a tip-Mach
                       ceiling is a compressibility screen, not a compliance
                       demonstration. The engine's actual aeroelastic work is in
                       whirlflutter.js and wingmodes.js. Scoped honestly below. */
                    title:"Aeroelasticity — tip Mach screen only",
                    desc:"VTOL.2245 requires freedom from flutter, divergence and dangerous oscillation. This row is NOT that demonstration: it screens blade tip Mach < 0.70, a tool rule for compressibility. Whirl flutter and wing modes are computed separately.",
                    check: SR.TipMach < 0.70,
                    value: `Mtip = ${SR.TipMach}`,
                    limit: "< 0.70",
                    severity:"critical",
                  },
                  // Performance — SC-VTOL Category Basic vs Enhanced
                  {
                    id:"EASA-P1", ref:"SC-VTOL-01 VTOL.2005 Category Basic/Enhanced",
                    category:"Flight Performance",
                    title:"Category Classification",
                    desc:"Category Basic: controlled emergency landing after critical failure. Category Enhanced: continued safe flight and landing. SM > 5% required for both.",
                    check: SR.SM_vt > 0.05,
                    value: `SM = ${(SR.SM_vt*100).toFixed(1)}% | Category: ${SR.SM_vt>0.10?"Enhanced-eligible":"Basic"}`,
                    limit: "SM > 5% MAC",
                    severity:"critical",
                  },
                  {
                    id:"EASA-P2", ref:"FAA powered-lift SFAR / EASA SC-VTOL VTOL.2430(b)(4)",
                    category:"Flight Performance",
                    title:"Reserve Energy (30 min IFR / 20 min VFR)",
                    /* THE NUMBER IS THE FAA'S, NOT EASA'S. This row previously read
                       "SC-VTOL requires 20 min VFR reserve" and cited two paragraph
                       numbers, neither of which appears in any primary document in
                       the corpus. EASA states the requirement without a value:
                       VTOL.2430(b)(4), and MOC SC-VTOL Issue 2 p.5 speaks only of
                       "the sufficient reserve accepted for compliance". The 20/30
                       minutes are the FAA powered-lift SFAR's. */
                    desc:"FAA powered-lift SFAR: 20 min VFR (1,200s), 30 min IFR (1,800s). EASA SC-VTOL VTOL.2430(b)(4) requires a sufficient reserve but specifies no value — the threshold checked here is the FAA's.",
                    check: SR.tres >= 1200,
                    value: `${SR.tres}s = ${(SR.tres/60).toFixed(1)} min`,
                    limit: "≥ 1,200s VFR / 1,800s IFR",
                    severity:"critical",
                  },
                  {
                    id:"EASA-P3", ref:"SC-VTOL-01 VTOL.2100 / CS-27.143",
                    category:"Flight Performance",
                    title:"Fus/Span Ratio — Fuselage-Wing Proportions",
                    desc:"Fuselage/span ratio must remain within 0.50–0.72 for realistic eVTOL proportions per EASA SC-VTOL design guidance.",
                    check: SR.fusSpanRatio >= 0.50 && SR.fusSpanRatio <= 0.72,
                    value: `${SR.fusSpanRatio?.toFixed(3) || "—"}`,
                    limit: "0.50–0.72",
                    severity:"advisory",
                  },
                  // Noise — EASA CS-36 / UAM Community Noise
                  {
                    id:"EASA-N1", ref:"EASA SC-VTOL / CS-36 Appendix J / UAM Community Noise Target",
                    category:"Noise (EASA CS-36 / UAM)",
                    title:"UAM Community Noise Target (65 dBA)",
                    desc:"EASA UAM community noise target: ≤ 65 dBA at 150m for urban integration acceptance. Estimated hover noise must meet this.",
                    check: dBA_hover <= 65,
                    value: `~${dBA_hover.toFixed(1)} dBA (at ${r_ref}m)`,
                    limit: "≤ 65 dBA (UAM target)",
                    severity:"major",
                  },
                  {
                    id:"EASA-N2", ref:"EASA CS-36 Appendix H+J / ICAO Annex 16 Vol.I",
                    category:"Noise (EASA CS-36 / UAM)",
                    title:"Tip Speed — Urban Noise Compliance",
                    desc:"EASA CS-36 noise evaluation: lower tip speeds required for urban operations. Target ≤ 180 m/s for enhanced community acceptance.",
                    check: SR.TipSpd <= 180,
                    value: `${U.speed(SR.TipSpd)} ${U.speedU}`,
                    limit: `≤ ${U.speed(180)} ${U.speedU} (EASA enhanced target)`,
                    severity:"major",
                  },
                  /* ── BATTERY SAFETY — THE PARAGRAPH SAYS SOMETHING ELSE ──
                     All three rows below cited VTOL.2330, and the citation gate
                     confirms VTOL.2330 exists, so they passed it. They were
                     found by RENDERING this tab and reading it, not by a gate.

                     VTOL.2330 is "Fire Protection in designated fire zones":
                     structures adjacent to fire zones withstanding fire, a
                     release of stored energy not precluding continued safe
                     flight, terminals and cables being fire-resistant. It says
                     nothing about a battery mass fraction, a C-rate, or a state
                     of charge, and neither "mass fraction" nor "C-rate" occurs
                     anywhere in SC-VTOL-02 or in the MOCs held here. "MOC-3" is
                     not held at all.

                     THE LIMIT OF A CITATION GATE, worth stating: it proves a
                     paragraph EXISTS. It cannot know whether the paragraph is
                     about what the row claims. These three were the FAA battery
                     rows' twins and had to be corrected the same way. */
                  {
                    id:"EASA-B1", ref:"TOOL RULE — cf. VTOL.2330 (fire protection)",
                    category:"Battery Safety (tool rules)",
                    title:"Hover C-rate — thermal screen (tool rule)",
                    desc:"A TOOL RULE. VTOL.2330 is fire protection in designated fire zones and states no C-rate; RTCA DO-311A is not held here, so its §2.4.5.5 was never read. 5C is this tool's own hover screen. The engine's sourced thermal model is battery-thermal.js.",
                    check: C_hover <= 5.0,
                    value: `${C_hover.toFixed(2)}C hover C-rate`,
                    limit: "≤ 5C (tool rule)",
                    severity:"critical",
                  },
                  {
                    id:"EASA-B2", ref:"TOOL RULE — SC-E-19 not held",
                    category:"Battery Safety (tool rules)",
                    title:"SoC Reserve Margin (tool rule)",
                    desc:"A TOOL RULE. The SoC floor checked here is the socMin parameter the user sets, not a regulatory minimum: VTOL.2330 is fire protection, and Special Condition SC-E-19 is not held in the corpus, so nothing it says has been read.",
                    check: reserve_pct >= (socFloor * 100),
                    value: `${reserve_pct.toFixed(1)}% final SoC (min: ${(socFloor*100).toFixed(1)}%)`,
                    limit: `≥ ${(socFloor*100).toFixed(1)}%`,
                    severity:"critical",
                  },
                  {
                    id:"EASA-B3", ref:"TOOL RULE — same 55% as FAA-B1",
                    category:"Battery Safety (tool rules)",
                    title:"Battery Mass Fraction (tool rule)",
                    desc:"A TOOL RULE, and the SAME 55% as FAA-B1 above — it was presented as an FAA requirement in one list and an EASA one in the other. No paragraph of either framework states a battery mass fraction.",
                    check: batFrac < 0.55,
                    value: `${(batFrac*100).toFixed(1)}%`,
                    limit: "< 55% (tool rule)",
                    severity:"major",
                  },
                  // V-tail
                  {
                    id:"EASA-T1", ref:"SC-VTOL-01 VTOL.2100 / CS-27.155",
                    category:"Control Surfaces",
                    title:"V-tail Pitch Authority",
                    desc:"Control surfaces must provide adequate pitch authority. Sh_eff/Sh_req ≥ 1.0 ensures pitch stability margin.",
                    check: SR.pitch_ratio >= 1.0,
                    value: `${(SR.pitch_ratio*100).toFixed(0)}% of requirement`,
                    limit: "≥ 100%",
                    severity:"critical",
                  },
                  {
                    id:"EASA-T2", ref:"SC-VTOL-01 VTOL.2100 / CS-27.155",
                    category:"Control Surfaces",
                    title:"V-tail Yaw Authority",
                    desc:"Differential ruddervator must provide adequate yaw authority. Sv_eff/Sv_req ≥ 1.0.",
                    check: SR.yaw_ratio >= 1.0,
                    value: `${(SR.yaw_ratio*100).toFixed(0)}% of requirement`,
                    limit: "≥ 100%",
                    severity:"critical",
                  },
                ],
              };

              // Compute scores
              const score=(arr)=>{
                const total=arr.length;
                const passed=arr.filter(rule=>rule.check).length;
                const critical_fail=arr.filter(rule=>!rule.check&&rule.severity==="critical").length;
                const major_fail=arr.filter(rule=>!rule.check&&rule.severity==="major").length;
                return{total,passed,critical_fail,major_fail,pct:Math.round(passed/total*100)};
              };
              const faaScore=score(rules.FAA);
              const easaScore=score(rules.EASA);
              const allScore=score([...rules.FAA,...rules.EASA]);

              const sevColor={critical:SC.red,major:SC.amber,advisory:"#22d3ee"};
              const sevLabel={critical:"CRITICAL",major:"MAJOR",advisory:"ADVISORY"};

              return(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* Header */}
                <div style={{background:SC.panel,
                  border:`1px solid #3b82f644`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:6}}>REGULATORY COMPLIANCE — CONCEPTUAL DESIGN PHASE</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
                    <span style={{color:SC.blue}}>Certification</span> Compliance Checker
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7,maxWidth:760}}>
                    Auto-checks your design against <span style={{color:SC.blue,fontWeight:700}}>FAA AC 21.17-4</span> (Type Certification — Powered-lift, July 2025) and
                    <span style={{color:SC.caution,fontWeight:700}}> EASA SC-VTOL Issue 2</span> (Special Condition for VTOL-capable aircraft).
                    Results are <em>conceptual-phase guidance only</em> — actual certification requires full compliance documentation with the regulatory authority.
                    Severity: <span style={{color:SC.red}}>■ Critical</span> = must fix · <span style={{color:SC.amber}}>■ Major</span> = significant risk · <span style={{color:"#22d3ee"}}>■ Advisory</span> = recommended.
                  </div>
                </div>

                {/* Score cards */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  {[
                    ["FAA AC 21.17-4",faaScore,SC.blue,""],
                    ["EASA SC-VTOL",easaScore,SC.amber,""],
                    ["Combined",allScore,allScore.critical_fail===0?SC.green:SC.red,""],
                  ].map(([title,s,col,flag])=>(
                    <div key={title} style={{background:SC.panel,border:`2px solid ${col}44`,borderRadius:10,padding:"16px 18px"}}>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:6}}>{flag} {title}</div>
                      {/* Score circle */}
                      <div style={{display:"flex",alignItems:"center",gap:14}}>
                        <div style={{width:64,height:64,borderRadius:"50%",flexShrink:0,
                          background:`conic-gradient(${col} ${s.pct*3.6}deg, ${SC.border} 0deg)`,
                          display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                          <div style={{width:50,height:50,borderRadius:"50%",background:SC.panel,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:14,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>
                            {s.pct}%
                          </div>
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace"}}>
                            {s.passed}/{s.total} passed
                          </div>
                          {s.critical_fail>0&&<div style={{fontSize:10,color:SC.red,fontFamily:"'DM Mono',monospace"}}>{s.critical_fail} critical fail{s.critical_fail>1?"s":""}</div>}
                          {s.major_fail>0&&<div style={{fontSize:10,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>⚠ {s.major_fail} major fail{s.major_fail>1?"s":""}</div>}
                          {s.critical_fail===0&&s.major_fail===0&&<div style={{fontSize:10,color:SC.green,fontFamily:"'DM Mono',monospace"}}>✓ No critical/major issues</div>}
                        </div>
                      </div>
                      <div style={{marginTop:10,height:4,background:SC.border,borderRadius:2}}>
                        <div style={{width:`${s.pct}%`,height:"100%",background:col,borderRadius:2,transition:"width 0.5s"}}/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Key parameters used */}
                <div style={{background:SC.panel,border:`1px solid ${SC.border}`,borderRadius:8,padding:"12px 16px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:10,textTransform:"uppercase"}}>Design Parameters Used in Compliance Check</div>
                  <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                    {[
                      ["MTOW",`${U.mass(MTOW_kg)} ${U.massU} / ${MTOW_lb.toFixed(0)} lb`,SC.amber],
                      ["Passengers",`~${nPax} pax`,SC.teal],
                      ["Battery Frac",`${(batFrac*100).toFixed(1)}%`,batFrac<0.55?SC.green:SC.red],
                      ["Hover C-rate",`${C_hover.toFixed(2)}C`,C_hover<5?SC.green:SC.red],
                      ["SM w/Vtail",`${(SR.SM_vt*100).toFixed(1)}%`,SR.SM_vt>0.05&&SR.SM_vt<0.25?SC.green:SC.red],
                      ["Tip Mach",SR.TipMach,SR.TipMach<0.70?SC.green:SC.red],
                      ["Tip Speed",`${U.speed(SR.TipSpd)} ${U.speedU}`,SR.TipSpd<180?SC.green:SR.TipSpd<200?SC.amber:SC.red],
                      ["BPF",`${BPF.toFixed(0)} Hz`,BPF<150?SC.green:SC.amber],
                      ["Est. Noise",`${dBA_hover.toFixed(0)} dBA`,dBA_hover<65?SC.green:dBA_hover<75?SC.amber:SC.red],
                      ["Reserve",`${(SR.tres/60).toFixed(1)} min`,SR.tres>=1200?SC.green:SC.red],
                    ].map(([lbl,val,col])=>(
                      <div key={lbl} style={{background:SC.bg,border:`1px solid ${col}33`,borderRadius:6,padding:"6px 10px"}}>
                        <div style={{fontSize:8,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                        <div style={{fontSize:11,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* FAA Rules */}
                <div style={{background:SC.panel,border:`1px solid ${SC.blue}33`,borderRadius:8,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,borderBottom:`1px solid ${SC.border}`,paddingBottom:10}}>
                    
                    <div>
                      <div style={{fontSize:13,fontWeight:800,color:SC.blue,fontFamily:"'DM Mono',monospace"}}>FAA AC 21.17-4</div>
                      <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>Type Certification — Powered-lift (July 2025) · 14 CFR §21.17(b)</div>
                    </div>
                    <div style={{marginLeft:"auto",textAlign:"right"}}>
                      <div style={{fontSize:18,fontWeight:800,color:faaScore.pct>=80?SC.green:faaScore.pct>=60?SC.amber:SC.red,fontFamily:"'DM Mono',monospace"}}>{faaScore.pct}%</div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{faaScore.passed}/{faaScore.total} checks</div>
                    </div>
                  </div>
                  {/* Group by category */}
                  {[...new Set(rules.FAA.map(rl=>rl.category))].map(cat=>(
                    <div key={cat} style={{marginBottom:14}}>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",
                        textTransform:"uppercase",marginBottom:6,paddingLeft:2}}>{cat}</div>
                      {rules.FAA.filter(rl=>rl.category===cat).map(rule=>(
                        <div key={rule.id} style={{
                          background:rule.check?`${SC.green}08`:`${sevColor[rule.severity]}0c`,
                          border:`1px solid ${rule.check?SC.green+"22":sevColor[rule.severity]+"44"}`,
                          borderRadius:6,padding:"10px 14px",marginBottom:6,
                          borderLeft:`3px solid ${rule.check?SC.green:sevColor[rule.severity]}`}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{fontSize:14}}>{mark(rule.check)}</span>
                                <span style={{fontSize:11,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{rule.title}</span>
                                {!rule.check&&(
                                  <span style={{fontSize:8,padding:"2px 6px",borderRadius:3,fontWeight:700,
                                    fontFamily:"'DM Mono',monospace",
                                    background:`${sevColor[rule.severity]}22`,color:sevColor[rule.severity]}}>
                                    {sevLabel[rule.severity]}
                                  </span>
                                )}
                              </div>
                              <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4,lineHeight:1.5}}>{rule.desc}</div>
                              <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>Ref: {rule.ref}</div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0,minWidth:130}}>
                              <div style={{fontSize:11,color:rule.check?SC.green:sevColor[rule.severity],fontFamily:"'DM Mono',monospace",fontWeight:700}}>{rule.value}</div>
                              <div style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginTop:2}}>Limit: {rule.limit}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* EASA Rules */}
                <div style={{background:SC.panel,border:`1px solid ${SC.amber}33`,borderRadius:8,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,borderBottom:`1px solid ${SC.border}`,paddingBottom:10}}>
                    
                    <div>
                      <div style={{fontSize:13,fontWeight:800,color:SC.amber,fontFamily:"'DM Mono',monospace"}}>EASA SC-VTOL Issue 2</div>
                      <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>Special Condition for VTOL-capable aircraft · MOC-3 SC-VTOL Battery Safety</div>
                    </div>
                    <div style={{marginLeft:"auto",textAlign:"right"}}>
                      <div style={{fontSize:18,fontWeight:800,color:easaScore.pct>=80?SC.green:easaScore.pct>=60?SC.amber:SC.red,fontFamily:"'DM Mono',monospace"}}>{easaScore.pct}%</div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{easaScore.passed}/{easaScore.total} checks</div>
                    </div>
                  </div>
                  {[...new Set(rules.EASA.map(rl=>rl.category))].map(cat=>(
                    <div key={cat} style={{marginBottom:14}}>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",
                        textTransform:"uppercase",marginBottom:6,paddingLeft:2}}>{cat}</div>
                      {rules.EASA.filter(rl=>rl.category===cat).map(rule=>(
                        <div key={rule.id} style={{
                          background:rule.check?`${SC.green}08`:`${sevColor[rule.severity]}0c`,
                          border:`1px solid ${rule.check?SC.green+"22":sevColor[rule.severity]+"44"}`,
                          borderRadius:6,padding:"10px 14px",marginBottom:6,
                          borderLeft:`3px solid ${rule.check?SC.green:sevColor[rule.severity]}`}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{fontSize:14}}>{mark(rule.check)}</span>
                                <span style={{fontSize:11,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace"}}>{rule.title}</span>
                                {!rule.check&&(
                                  <span style={{fontSize:8,padding:"2px 6px",borderRadius:3,fontWeight:700,
                                    fontFamily:"'DM Mono',monospace",
                                    background:`${sevColor[rule.severity]}22`,color:sevColor[rule.severity]}}>
                                    {sevLabel[rule.severity]}
                                  </span>
                                )}
                              </div>
                              <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:4,lineHeight:1.5}}>{rule.desc}</div>
                              <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>Ref: {rule.ref}</div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0,minWidth:130}}>
                              <div style={{fontSize:11,color:rule.check?SC.green:sevColor[rule.severity],fontFamily:"'DM Mono',monospace",fontWeight:700}}>{rule.value}</div>
                              <div style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginTop:2}}>Limit: {rule.limit}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Disclaimer */}
                <div style={{padding:"10px 14px",background:`${SC.blue}0a`,border:`1px solid ${SC.blue}22`,
                  borderRadius:6,fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
                  ⓘ <strong style={{color:SC.text}}>Important:</strong> This checker provides <em>conceptual-design phase guidance</em> based on publicly available FAA AC 21.17-4 (July 2025),
                  EASA SC-VTOL Issue 2, and MOC-3 SC-VTOL. It is <strong>not a substitute for formal compliance documentation</strong>.
                  Actual type certification requires full qualification testing, G-1/G-2 issue papers, and regulatory authority approval.
                  Noise estimates use a simplified Pegg-type model (±5 dB accuracy); actual certification requires flight testing per 14 CFR Part 36 / EASA CS-36.
                </div>

              </div>
              );
            
}
