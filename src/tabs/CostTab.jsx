import { grid as chartGrid, axis as chartAxis, tooltip as chartTooltip, legend as chartLegend } from "../ui/chart.js";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { KPI, Panel } from "../ui/primitives.jsx";
import { DOC_CONSTANTS as K, seatCount, unsourcedConstants } from "../engine/economics/doc-constants.js";
import { SC } from "../lib/theme.js";

/* Tab 12 — Cost.
   Extracted from App.jsx. Receives the App context as a single `ctx`
   prop; everything it reads is destructured explicitly below, so the tab's
   dependency on App state is visible in one place. */
export function CostTab(ctx) {
  const { SR, TTP, costCellKwh, costElecRate, costFlightsPerDay, costMotorPerKw, darkMode, params, setCostCellKwh, setCostElecRate, setCostFlightsPerDay, setCostMotorPerKw, tab } = ctx;

              // ═══════════════════════════════════════════════════
              // COST MODEL — energy economics + lifecycle
              // Based on: NREL eVTOL cost studies, Joby/Archer investor docs
              // ═══════════════════════════════════════════════════
              // ═══════════════════════════════════════════════════════════════════
              // DIRECT OPERATING COST (DOC) MODEL
              // Formulas: ICAO Doc 9502, ATA iSpec 2200, Vascik MIT 2020
              // Battery:  BNEF Electric Vehicle Outlook 2024 ($/kWh)
              // Ops:      NASA/CR-2019-220217 UAM Market Study (Oliver Wyman)
              //           Joby S-1 2021, Archer S-1 2021 investor disclosures
              // Maint:    FAA Helicopter Flying Handbook AC 61-13B benchmark
              //           Booz Allen / NASA AAM Cost Model 2021
              // Insurance: GAMA Statistical Databook 2023
              // Electricity: EIA Electric Power Monthly (Nov 2024)
              // ═══════════════════════════════════════════════════════════════

              // ─────────────────────────────────────────────────────────────────
              // DIRECT OPERATING COST (DOC) MODEL v4
              // EVERY CONSTANT AND ITS PROVENANCE: engine/economics/doc-constants.js
              // The formula panel at the bottom of this tab RENDERS FROM THAT TABLE,
              // so a displayed coefficient can no longer disagree with the computed
              // one -- which it did, on every maintenance term and on the energy
              // efficiency chain.
              //
              // Four attributions from the old header did not survive checking and
              // are gone rather than reassigned: a "Booz Allen / NASA AAM Cost Model
              // 2021" that could not be found to exist, ATA iSpec 2200 (a manual
              // documentation standard, not a cost method), GAMA's Databook for an
              // insurance rate it does not publish, and ICAO Doc 9502 / Vascik for a
              // vertiport fee that is the literal number 35.
              // What survives: BNEF EVO 2024, Fraunhofer ISE 2023, Thornton 2019,
              // Waldmann 2014, NASA/CR-2019-220217, Rolls-Royce and Siemens TBO data.
              // 22 of 35 constants have NO source and now say so on screen, and
              // validation/economics.mjs reports that count on every run.
              // ─────────────────────────────────────────────────────────────────

              // ── 1. OPERATIONAL PARAMETERS ─────────────────────────────────
              const flightsPerDay     = costFlightsPerDay;
              const daysPerYear       = K.daysPerYear.value;
              const flightsPerYear    = flightsPerDay * daysPerYear;
              const flightDuration_hr = SR.Tend / 3600;
              const tripDist_km       = SR ? (SR.totalRange||params.range) : params.range;
              /* ONE occupant mass, from the engine. This tab used to round a
                 hardcoded 90 kg while CertificationTab floored the same 90 kg:
                 over a 100-900 kg payload sweep the two disagreed at 81 of 161
                 points, and cost_per_seat_km is divided by this number. */
              const nSeats            = seatCount(params.payload);

              // ── 2. ENERGY COST — charger round-trip efficiency only ─────────
              // SR.Etot = electrical energy drawn from the battery pack [kWh].
              // Battery discharge losses (Joule heating in pack) are already captured
              // inside the physics engine via etaBat (discharge η in Wbat formula).
              // Adding eta_bat_discharge here would double-count those losses.
              //
              // What IS missing from SR.Etot: the ground-side charger losses
              // (AC grid → onboard battery), governed by charger efficiency η_charger.
              // Grid draw = SR.Etot / η_charger  (FIX 3.1: removed eta_bat_discharge)
              //
              // η_charger: ground-side AC/DC round-trip (SAE ARP6504)
              //   At 1C recharge: ~0.95; at 3C fast-charge: ~0.88
              const CrateHov         = SR.CrateHov || 3.0;
              const eta_charger       = Math.max(K.chargerEtaFloor.value,
                K.chargerEtaBase.value - K.chargerEtaCrateSlope.value * CrateHov);
              // FIX 3.1: energyPerFlight = SR.Etot / η_charger  (NOT ÷ eta_bat_discharge too)
              const energyPerFlight_kWh = SR.Etot / eta_charger;
              // Time-of-use: EIA 2024 base + vertiport demand charge (EPRI 2023)
              const electricityRate_base = costElecRate * 0.75;   // base portion
              const demandCharge         = costElecRate * 0.25;   // demand charge portion
              const electricityRate_kWh  = electricityRate_base + demandCharge; // = costElecRate
              const energyCost_per_flight = energyPerFlight_kWh * electricityRate_kWh;

              // ── 3. BATTERY REPLACEMENT — cell $/kWh(SED) + fixed pack overhead ─
              // Separated into two physically distinct components:
              //   (a) Cell cost: scales with SED via BNEF learning curve (∝ SED^−0.3)
              //       Ref: $149/kWh at 300 Wh/kg (BNEF EVO 2024 NMC)
              //   (b) Pack overhead: BMS, thermal mgmt, structure, wiring
              //       ~$55/kWh mostly fixed (Fraunhofer ISE 2023 pack cost study)
              //       SED improvement reduces cell cost but NOT pack overhead
              // Aviation cert premium 2× on both (FAA AC 21.17-4 qualification costs)
              const sedRef              = K.cellCostRefSED.value;
              const cellCostPerKwh      = costCellKwh * Math.pow(sedRef / Math.max(100, params.sedCell), 0.3);
              const packOH_per_kWh      = K.packOverheadPerKwh.value;
              const certFactor          = K.certFactor.value;
              const battCostPerKwh_pack = (cellCostPerKwh + packOH_per_kWh) * certFactor;
              const packReplCost        = SR.PackkWh * battCostPerKwh_pack;

              // Cycle life: DoD both directions (Thornton 2019) × C-rate penalty (Waldmann 2014)
              //   DoD < 50%: bonus (shallow discharge extends life)
              //   DoD > 50%: penalty (deep discharge accelerates SEI cracking)
              //   Combined: Neff = Nrated × (0.50/DoD)^β, β=0.5 (bonus), β=0.6 (penalty)
              //   C-rate penalty: Neff further reduced by high discharge currents
              const batteryCycles  = K.batteryCyclesRated.value;
              const chargeDepth    = Math.min(0.85, SR.Etot / SR.PackkWh);
              const dodExponent    = chargeDepth < 0.50 ? K.dodExponentShallow.value
                                                        : K.dodExponentDeep.value;
              const dodFactor      = Math.pow(0.50 / chargeDepth, dodExponent);
              const cRatePenalty   = Math.max(0.50, Math.pow(
                K.cRateRefForCycleLife.value / Math.max(1.0, CrateHov), K.cRatePenaltyExponent.value));
              const effectiveCycles = Math.floor(Math.min(2000, batteryCycles * dodFactor * cRatePenalty));
              const battCost_per_flight = packReplCost / Math.max(1, effectiveCycles);

              // ── 4. MAINTENANCE — scheduled + MMH-variable + MTBF unscheduled ─
              // Scheduled: annual A-check equivalent — Booz Allen NASA AAM 2021
              const scheduledMx_annual    = K.scheduledMxAnnual.value;
              const scheduledMx_per_flight = scheduledMx_annual / flightsPerYear;

              // Variable MMH = f(nMotors, hoverFraction) — calibrated vs eVTOL-master
              // eVTOL-master: MMH_FH = 0.6 (helicopter baseline, Booz Allen)
              // Our formula scales from 0.6 baseline + motor count + hover fraction penalty
              //   → conservative for novel eVTOL with more drive train components
              const hoverFraction  = (SR.tto + SR.tld) / Math.max(1, SR.Tend);
              const MMH_base       = K.mmhBase.value;
              const MMH_motors     = K.mmhPerExtraMotor.value * Math.max(0, params.nPropHover - 4);
              const MMH_hover      = K.mmhHoverPenalty.value * hoverFraction;
              const MMH_per_FH     = MMH_base + MMH_motors + MMH_hover;
              const laborRate_per_hr = K.labourRatePerHour.value;
              const partsCost_per_FH = K.partsCostPerFH.value;
              const maintRate_per_FH = MMH_per_FH * laborRate_per_hr + partsCost_per_FH;
              const varMaintCost_per_flight = maintRate_per_FH * flightDuration_hr;

              // Unscheduled (MTBF-driven): failure events per FH × avg repair cost
              //   Motor MTBF: 8,000 hr (Rolls-Royce E-Motor TBO target, 2022)
              //   ESC/inverter MTBF: 5,000 hr (Siemens SP260D data)
              //   Avg unscheduled repair: $1,200/event (Booz Allen AAM 2021)
              const MTBF_motor_hr  = K.mtbfMotorHours.value;
              const MTBF_ESC_hr    = K.mtbfEscHours.value;
              const unschRepair_$  = K.unscheduledRepairCost.value;
              const failRate_FH    = params.nPropHover * (1/MTBF_motor_hr + 1/MTBF_ESC_hr);
              const unschedMx_per_flight = failRate_FH * unschRepair_$ * flightDuration_hr;

              const maintenanceCost_per_flight = scheduledMx_per_flight + varMaintCost_per_flight + unschedMx_per_flight;

              // ── 5. MOTOR REPLACEMENT COST ─────────────────────────────────
              const motorTBO_hr    = K.motorTboHours.value;
              const motorCost_per_kW = costMotorPerKw;
              const motorCount     = params.nPropHover;
              const motorCostEach  = SR.PmotKW * motorCost_per_kW;
              const flightsPerMotor = Math.floor(motorTBO_hr / Math.max(0.1, flightDuration_hr));
              const motorCost_per_flight = (motorCostEach * motorCount) / Math.max(1, flightsPerMotor);

              // ── 6. INSURANCE ──────────────────────────────────────────────
              const aircraftValue  = SR.MTOW * K.aircraftValuePerKgMTOW.value;
              const insuranceRate  = K.insuranceRateAnnual.value;
              const insuranceCost_per_flight = (aircraftValue * insuranceRate) / flightsPerYear;

              // ── 7. VERTIPORT INFRASTRUCTURE FEE ──────────────────────────
              const vertiportFee_per_flight = K.vertiportFeePerFlight.value;

              // ── 8. PILOT / RPIC OPERATOR — autonomy scenario ─────────────
              // eVTOL roadmap: piloted → remote supervised → fully autonomous
              //   Piloted:    full salary per aircraft (current ops)
              //   Remote:     1 RPIC supervises 4 aircraft simultaneously (near-term)
              //   Autonomous: minimal oversight, ~$5k/yr/aircraft residual (far-term)
              // Ref: FAA AC 21.17-4, Joby/Wisk autonomy roadmaps
              const autonomyMode = 0; // 0=piloted, 1=remote, 2=autonomous
              const rpicSalary_annual = K.rpicSalaryAnnual.value;
              const aircraftPerRPIC   = autonomyMode === 0 ? 4 : autonomyMode === 1 ? 12 : 100;
              const dutyHoursPerYear  = daysPerYear * K.dutyHoursPerDay.value;
              const rpicCostPerHour   = rpicSalary_annual / (aircraftPerRPIC * dutyHoursPerYear);
              const turnaroundTime_hr = K.turnaroundHours.value;
              const operatorCost_per_flight = rpicCostPerHour * (flightDuration_hr + turnaroundTime_hr);

              // ── 9. TYPE CERTIFICATION & AIRWORTHINESS AMORTIZATION ────────
              // FIX 3.3: $1M was a software bug — FAA Part 21 type cert for a novel
              // eVTOL category costs $50M–$200M (Joby ~$100M, Archer estimate similar).
              // Reference: FAA AC 21.17-4 (powered-lift cert), Congressional testimony
              // Joby Aviation S-1 (2021), NASA UAM Ecosystem (Vascik 2020).
              // Amortized over a 50-aircraft fleet × 10 operating years:
              //   certCost_per_flight = $75M / (50 × 3000 flights/yr × 10 yr) ≈ $0.50/flight
              // (Previously $1M / (3000 × 10) ≈ $0.033/flight — factor of 75× too low.)
              const certCost_total    = K.certCostTotal.value;
              const certFleetSize     = K.certFleetSize.value;
              const aircraftLifeYears = K.aircraftLifeYears.value;
              const certCost_per_flight = certCost_total / (certFleetSize * flightsPerYear * aircraftLifeYears);

              // ── 10. TOTAL DOC ──────────────────────────────────────────────
              const totalCost_per_flight = energyCost_per_flight
                + battCost_per_flight
                + motorCost_per_flight
                + maintenanceCost_per_flight
                + insuranceCost_per_flight
                + vertiportFee_per_flight
                + operatorCost_per_flight
                + certCost_per_flight;

              const cost_per_km      = totalCost_per_flight / tripDist_km;
              const cost_per_seat_km = cost_per_km / Math.max(1, nSeats);

              // ── 11. REVENUE MODEL ─────────────────────────────────────────
              const farePerKm        = K.farePerKm.value;
              const loadFactor       = K.loadFactor.value;
              const revenuePerFlight = farePerKm * tripDist_km * loadFactor;
              const annualRevenue    = revenuePerFlight * flightsPerYear;
              const annualCost       = totalCost_per_flight * flightsPerYear;
              const annualProfit     = annualRevenue - annualCost;
              const profitMargin     = annualRevenue > 0 ? (annualProfit / annualRevenue) * 100 : -100;

              // ── 12. BREAK-EVEN — profit vs LF curve (not just single point) ─
              // Compute profit at 11 load-factor points (0..100%) for each fare scenario
              // This shows full sensitivity: where each route crosses zero profit
              const fareScenarios = [
                {label:"Joby $1.86/km", fare:1.86, col:SC.nominal},
                {label:"NASA $4.50/km", fare:4.50, col:SC.caution},
                {label:"Blade $6.00/km",fare:6.00, col:"#8b5cf6"},
              ].map(s=>({
                ...s,
                beLF: Math.min(1, totalCost_per_flight / (Math.max(1,nSeats) * s.fare * tripDist_km)),
              }));
              // LF vs profit data for chart (11 points, 0%→100%)
              const profitVsLF = Array.from({length:11},(_,i)=>{
                const lf = i / 10;
                const obj = {lf: +(lf*100).toFixed(0)};
                fareScenarios.forEach(s=>{
                  const rev = s.fare * tripDist_km * nSeats * lf;
                  obj[s.label] = +(rev - totalCost_per_flight).toFixed(0);
                });
                return obj;
              });
              const breakEvenLF      = fareScenarios[1].beLF;
              const breakEvenFare_km = totalCost_per_flight / (Math.max(1,nSeats) * loadFactor * tripDist_km);

              // ── 13. ROI / PAYBACK ──────────────────────────────────────────
              const aircraftCost  = SR.MTOW * 800;
              const paybackYears  = annualProfit > 0 ? aircraftCost / annualProfit : Infinity;

              const helicopter_cost_per_km = K.helicopterCostPerKm.value;
              const savings_vs_heli_pct    = ((helicopter_cost_per_km - cost_per_km) / helicopter_cost_per_km) * 100;

              // Battery degradation curve (SoH vs cycle count) — NREL power-law model
              const degradationData = Array.from({length:11},(_,i)=>{
                const cycles = i * batteryCycles / 10;
                const SoH = Math.max(0.60, 1 - 0.20 * Math.pow(cycles / batteryCycles, 0.8));
                return {cycles:+cycles.toFixed(0), SoH:+(SoH*100).toFixed(1),
                  capacity:+(SoH*SR.PackkWh).toFixed(2)};
              });

              // Cost breakdown for pie
              const costParts=[
                {name:"Battery",    val:+battCost_per_flight.toFixed(2),        col:SC.caution},
                {name:"Maintenance",val:+maintenanceCost_per_flight.toFixed(2), col:"#8b5cf6"},
                {name:"Insurance",  val:+insuranceCost_per_flight.toFixed(2),   col:SC.warning},
                {name:"Energy",     val:+energyCost_per_flight.toFixed(2),      col:SC.nominal},
                {name:"Motors",     val:+motorCost_per_flight.toFixed(2),       col:SC.advisory},
                {name:"Vertiport",  val:+vertiportFee_per_flight.toFixed(2),    col:"#14b8a6"},
                {name:"Operator",   val:+operatorCost_per_flight.toFixed(2),    col:"#6c757d"},
                {name:"Cert/Airw.", val:+certCost_per_flight.toFixed(2),        col:"#ec4899"},
              ];

              return(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* A cost model for a battery aircraft, stated as such when the
                    design burns fuel: no fuel price, no turboshaft overhaul
                    cost is modelled, so the figures below do not describe it. */}
                {SR.powertrain==="turboelectric"&&(
                  <div role="alert" data-cost-powertrain-note="1"
                    style={{border:`1px solid ${SC.red}`,borderLeft:`4px solid ${SC.red}`,borderRadius:6,padding:"8px 12px",
                      background:SC.panel,color:SC.text,fontSize:11,fontFamily:"system-ui,sans-serif",lineHeight:1.5}}>
                    <b style={{color:SC.red}}>Not a cost for this aircraft.</b> This tab prices electricity and battery
                    cycling. The design is turboelectric: it burns {SR.fuelBurnKg} kg of fuel per mission, and neither a fuel
                    price nor turboshaft maintenance is modelled here. Energy and battery lines below describe a battery
                    aircraft of the same size, not this one.
                  </div>
                )}

                {/* Cost Assumption Sliders */}
                <div style={{background:SC.panel,border:`1px solid ${SC.green}33`,borderRadius:8,padding:"12px 16px"}}>
                  <div style={{fontSize:11,color:SC.muted,textTransform:"uppercase",letterSpacing:"0.08em",
                    fontFamily:"system-ui,sans-serif",marginBottom:10,borderBottom:`1px solid ${SC.border}`,paddingBottom:5}}>
                    Adjustable Cost Assumptions — drag to update DOC live
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    {[
                      ["Electricity Rate","$/kWh",costElecRate,0.08,0.40,0.01,setCostElecRate,"EIA 2024: $0.12 base + demand"],
                      ["Cell Cost","$/kWh",costCellKwh,60,250,1,setCostCellKwh,"BNEF 2024 NMC: $149/kWh"],
                      ["Motor Cost","$/kW",costMotorPerKw,40,300,5,setCostMotorPerKw,"Replacement cost per kW"],
                      ["Flights/Day","",costFlightsPerDay,4,20,1,setCostFlightsPerDay,"Utilisation: 10=Joby target"],
                    ].map(([lbl,unit,val,min,max,step,setter,note])=>(
                      <div key={lbl}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:11,color:SC.muted,fontFamily:"system-ui,sans-serif"}}>{lbl}</span>
                          <span style={{fontSize:11,fontWeight:700,color:SC.green,fontFamily:"'DM Mono',monospace"}}>{unit}{typeof val==='number'&&step<1?val.toFixed(2):val}</span>
                        </div>
                        <input type="range" min={min} max={max} step={step} value={val}
                          onChange={e=>setter(parseFloat(e.target.value))}
                          style={{width:"100%",accentColor:SC.green}}/>
                        <div style={{fontSize:9,color:SC.subtle,fontFamily:"'DM Mono',monospace",marginTop:2}}>{note}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Header */}
                <div style={{background:darkMode?"linear-gradient(135deg,#0d1a0d,#0a1f14)":SC.panel,
                  border:`1px solid #22c55e44`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.18em",marginBottom:6}}>$/FLIGHT ECONOMICS — LIFECYCLE COST MODEL</div>
                  <div style={{fontSize:18,fontWeight:800,color:SC.text,marginBottom:6}}>
                    <span style={{color:SC.green}}>Cost</span> Estimator & ROI Analysis
                  </div>
                  <div style={{fontSize:11,color:SC.muted,lineHeight:1.7}}>
                    Lifecycle cost model calibrated against NASA CR-2021-003, NASA/CR-2019-220217 UAM Cost Model,
                    FAA AC 21.17-4 (2023), BloombergNEF 2024, EIA 2024, and Joby/Archer investor disclosures.
                    Assumes <strong style={{color:SC.green}}>{flightsPerDay} flights/day · {daysPerYear} days/yr · {tripDist_km} km trip · {(loadFactor*100).toFixed(0)}% load factor</strong>.
                    All figures in 2025 USD. Maintenance scaled to flight duration ({(flightDuration_hr*60).toFixed(0)} min/flight).
                  </div>
                </div>

                {/* Top KPIs */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="Total DOC / Flight" value={`$${totalCost_per_flight.toFixed(0)}`} unit=""
                    color={SC.amber} sub={`$${cost_per_km.toFixed(2)}/km · $${cost_per_seat_km.toFixed(2)}/seat-km`}/>
                  <KPI label="vs Helicopter" value={`${savings_vs_heli_pct.toFixed(0)}% ${savings_vs_heli_pct>0?"cheaper":"costlier"}`} unit=""
                    color={savings_vs_heli_pct>0?SC.green:SC.red}
                    sub={`benchmark $${helicopter_cost_per_km}/km — unsourced`}/>
                  <KPI label="Annual Profit" value={annualProfit>0?`$${(annualProfit/1000).toFixed(0)}k`:"Not viable"} unit=""
                    color={annualProfit>0?SC.green:SC.red}
                    sub={`Margin: ${profitMargin.toFixed(1)}%`}/>
                  <KPI label="Payback Period" value={paybackYears===Infinity||paybackYears>99?"N/A":`${paybackYears.toFixed(1)} yrs`} unit=""
                    color={paybackYears<5?SC.green:paybackYears<10?SC.amber:SC.red}
                    sub={annualProfit>0?`Aircraft: $${(aircraftCost/1000).toFixed(0)}k`:"Profit negative → no payback"}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <KPI label="Energy Cost/Flight" value={`$${energyCost_per_flight.toFixed(2)}`} unit=""
                    color={SC.teal} sub={`${energyPerFlight_kWh} kWh × $${electricityRate_kWh.toFixed(2)}/kWh`}/>
                  <KPI label="Battery Cost/Flight" value={`$${battCost_per_flight.toFixed(2)}`} unit=""
                    color={SC.amber} sub={`${effectiveCycles} cycles · ${(chargeDepth*100).toFixed(0)}% DoD · ${CrateHov.toFixed(1)}C`}/>
                  <KPI label="Break-Even Load Factor" value={`${(breakEvenLF*100).toFixed(1)}%`} unit=""
                    color={breakEvenLF<0.7?SC.green:breakEvenLF<0.9?SC.amber:SC.red}
                    sub={`Need $${breakEvenFare_km.toFixed(2)}/km at 75% LF`}/>
                  <KPI label="Revenue/Flight" value={`$${revenuePerFlight.toFixed(0)}`} unit=""
                    color={SC.green} sub={`${nSeats} seats · ${(loadFactor*100).toFixed(0)}% LF · $${farePerKm}/km`}/>
                </div>

                {/* Cost breakdown + battery degradation */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Panel title="Cost Breakdown per Flight ($)" ht={280} onSave={true}>
                    <ResponsiveContainer width="100%" height={235}>
                      <PieChart>
                        <Pie isAnimationActive={false} data={costParts} dataKey="val" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                          {costParts.map((cp,i)=><Cell key={i} fill={cp.col}/>)}
                        </Pie>
                        <Tooltip {...TTP} formatter={(v)=>[`$${v}`,""]}/>
                        <Legend iconSize={8} wrapperStyle={{fontSize:10,color:SC.muted}} {...chartLegend()}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </Panel>
                  <Panel title="Battery Pack Degradation vs Charge Cycles" ht={280} onSave={true}>
                    <ResponsiveContainer width="100%" height={235}>
                      <AreaChart data={degradationData} margin={{top:5,right:15,left:-10,bottom:0}}>
                        <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SC.amber} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={SC.amber} stopOpacity={0.02}/>
                        </linearGradient></defs>
                        <CartesianGrid {...chartGrid()}/>
                        <XAxis dataKey="cycles" tick={{fontSize:9,fill:SC.muted}}
                          label={{value:"Cycles",position:"insideBottom",fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                        <YAxis domain={[50,105]} tick={{fontSize:9,fill:SC.muted}}
                          label={{value:"SoH (%)",angle:-90,position:"insideLeft",fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                        <Tooltip {...TTP} formatter={(v,n)=>[`${v}%`,n]}/>
                        <ReferenceLine y={80} stroke={SC.red} strokeDasharray="4 3"
                          label={{value:"80% SoH (replace)",fill:SC.red,fontSize:9,position:"right"}}/>
                        <Area isAnimationActive={false} type="monotone" dataKey="SoH" stroke={SC.amber} strokeWidth={2.5}
                          fill="url(#dg)" dot={false} name="State of Health (%)"/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>

                {/* Annual P&L */}
                <Panel title="Annual Economics — P&L Summary">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    <div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Annual Costs</div>
                      {[
                        ["Energy",          energyCost_per_flight*flightsPerYear],
                        ["Battery",         battCost_per_flight*flightsPerYear],
                        ["Motors",          motorCost_per_flight*flightsPerYear],
                        ["Maintenance",     maintenanceCost_per_flight*flightsPerYear],
                        ["Insurance",       insuranceCost_per_flight*flightsPerYear],
                        ["Vertiport fees",  vertiportFee_per_flight*flightsPerYear],
                        ["Operator",        operatorCost_per_flight*flightsPerYear],
                        ["Cert/Airworthiness", certCost_per_flight*flightsPerYear],
                      ].map(([k,v])=>{
                        const pct=v/annualCost*100;
                        return(
                          <div key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:`1px solid ${SC.border}22`}}>
                            <span style={{fontSize:10,color:SC.text,fontFamily:"'DM Mono',monospace",minWidth:110}}>{k}</span>
                            <div style={{flex:1,height:5,background:SC.border,borderRadius:2}}>
                              <div style={{width:`${pct}%`,height:"100%",background:SC.amber,borderRadius:2}}/>
                            </div>
                            <span style={{fontSize:10,color:SC.amber,fontFamily:"'DM Mono',monospace",minWidth:60,textAlign:"right"}}>${(v/1000).toFixed(0)}k</span>
                          </div>
                        );
                      })}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:`2px solid ${SC.border}`,marginTop:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:SC.text,fontFamily:"'DM Mono',monospace"}}>Total Annual Cost</span>
                        <span style={{fontSize:11,fontWeight:700,color:SC.red,fontFamily:"'DM Mono',monospace"}}>${(annualCost/1000).toFixed(0)}k</span>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:9,color:SC.muted,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Revenue & Profit</div>
                      {[
                        ["Flights/year",`${flightsPerYear.toLocaleString()}`,SC.muted],
                        ["Revenue/flight",`$${revenuePerFlight.toFixed(0)}`,SC.teal],
                        ["Annual Revenue",`$${(annualRevenue/1000).toFixed(0)}k`,SC.green],
                        ["Annual Cost",   `$${(annualCost/1000).toFixed(0)}k`,SC.red],
                        ["Annual Profit", `$${(annualProfit/1000).toFixed(0)}k`,annualProfit>0?SC.green:SC.red],
                        ["Profit Margin", `${profitMargin.toFixed(1)}%`,profitMargin>20?SC.green:profitMargin>5?SC.amber:SC.red],
                        ["Payback Period",paybackYears===Infinity?"Not viable":`${Math.min(99,paybackYears).toFixed(1)} yrs`,paybackYears<5?SC.green:paybackYears<20?SC.amber:SC.red],
                        ["Cost vs Heli",  `${savings_vs_heli_pct.toFixed(0)}% cheaper`,savings_vs_heli_pct>0?SC.green:SC.red],
                      ].map(([k,v,col])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${SC.border}22`}}>
                          <span style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace"}}>{k}</span>
                          <span style={{fontSize:11,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>

                {/* Sensitivity bar chart */}
                <Panel title="Cost Driver Analysis — % of Total Flight Cost" onSave={true}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      layout="vertical"
                      data={costParts.map(cpart=>({...cpart,pct:+(cpart.val/totalCost_per_flight*100).toFixed(1)})).sort((a,b)=>b.pct-a.pct)}
                      margin={{top:5,right:60,left:60,bottom:5}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis type="number" tick={{fontSize:9,fill:SC.muted}}
                        label={{value:"% of total cost",position:"insideBottom",fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:SC.muted}} width={80} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v)=>[`${v}%`,"Share"]}/>
                      <Bar isAnimationActive={false} dataKey="pct" radius={[0,4,4,0]} name="% of cost">
                        {costParts.sort((a,b)=>b.val-a.val).map((cp,i)=><Cell key={i} fill={cp.col}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{marginTop:8,padding:"8px 12px",background:`${SC.green}11`,
                    border:`1px solid ${SC.green}33`,borderRadius:6,fontSize:10,
                    color:SC.green,fontFamily:"'DM Mono',monospace",lineHeight:1.7}}>
                     <strong>DOC v4 — every line below is printed from the constants the code uses</strong><br/>
                    {/* Rendered from engine/economics/doc-constants.js. The previous
                        panel was hand-written prose and had drifted from the code on
                        every maintenance coefficient and on the energy chain. */}
                    {Object.entries(K).filter(([,c]) => c.text).map(([key,c]) => (
                      <span key={key}>• {c.text}
                        {c.status === "unsourced" ? <strong> [NO SOURCE]</strong> : ""}<br/></span>
                    ))}
                    <strong>{unsourcedConstants().length} of {Object.keys(K).length} constants have no source.</strong>{" "}
                    Nothing in this tab is validated against a real operator — there is no
                    published figure to check a cost per flight against the way a rotor
                    group weight is checked. Treat it as an ordered assumption set.<br/>
                     <strong>Break-even load factor = {(breakEvenLF*100).toFixed(1)}%</strong> at ${K.farePerKm.value}/km — if this exceeds 85% the route is marginal.
                  </div>
                </Panel>

                {/* Profit vs Load Factor curve */}
                <Panel title="Profit vs Load Factor — Fare Scenario Sensitivity" ht={300} onSave={true}>
                  <div style={{fontSize:10,color:SC.muted,fontFamily:"'DM Mono',monospace",marginBottom:6,paddingLeft:4}}>
                    Per-flight profit at each load factor for three market fare scenarios.
                    Zero-crossing = break-even LF. Above zero = profitable.
                  </div>
                  <ResponsiveContainer width="100%" height={235}>
                    <LineChart data={profitVsLF} margin={{top:5,right:20,left:5,bottom:20}}>
                      <CartesianGrid {...chartGrid()}/>
                      <XAxis dataKey="lf" tick={{fontSize:9,fill:SC.muted}}
                        label={{value:"Load factor (%)",position:"insideBottom",offset:-6,fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                      <YAxis tick={{fontSize:9,fill:SC.muted}}
                        tickFormatter={v=>`$${v}`}
                        label={{value:"Profit/flight ($)",angle:-90,position:"insideLeft",fontSize:10,fill:SC.muted}} {...chartAxis()}/>
                      <Tooltip {...TTP} formatter={(v,n)=>[`$${v}`,n]}/>
                      <Legend iconSize={9} wrapperStyle={{fontSize:10,color:SC.muted}} {...chartLegend()}/>
                      <ReferenceLine y={0} stroke={SC.muted} strokeWidth={1.5} strokeDasharray="4 2"
                        label={{value:"Break-even",fill:SC.muted,fontSize:9,position:"right"}}/>
                      {fareScenarios.map(s=>(
                        <Line isAnimationActive={false} key={s.label} type="monotone" dataKey={s.label}
                          stroke={s.col} strokeWidth={2} dot={false} name={s.label}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>
              </div>
              );
            
}
