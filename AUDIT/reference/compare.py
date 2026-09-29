"""Independent reference vs the production engine, default eVTOL design.
App values were extracted by running the engine; they are pasted in as data so
this file shares no code with the application (Phase 3 requirement).
"""
import math
from evtol_reference import (isa, hover_power_momentum, cruise_power,
                            dynamic_pressure, skin_friction_turbulent,
                            segment_energy_kWh, battery_pack_from_energy,
                            sutherland_mu, G0)

# ---- app outputs, default design, commit 3a7a5a4 -------------------------
APP = dict(MTOW=2772.06, Wempty=1588.99, Wbat=728.08, payload=455.0,
           Etot=164.85, PackkWh=203.519, PackUsablekWh=164.85,
           Phov=596.810, Pcr=232.96, LDact=9.77, Swing=19.83, bWing=13.36,
           MAC=1.555, Re_=8017158, Mach=0.1991, CD0tot=0.043324,
           Vstall=40.28, download=0.0735, etaHov=0.74, etaSys=0.80,
           nPropHover=12, propDiam=2.37, cruiseAlt=1000.0, vCruise=67.0,
           hoverHeight=15.24,
           Eto=4.973, Ecl=19.139, Ecr=76.417, Edc=0.331, Eld=4.973, Eres=59.016)

rows = []
def chk(name, ref, app, unit="", note=""):
    if app in (None, 0) and ref == 0:
        rel = 0.0
    else:
        rel = (app / ref - 1.0) * 100.0 if ref else float('nan')
    rows.append((name, ref, app, unit, rel, note))

print("=" * 108)
print("INDEPENDENT REFERENCE vs PRODUCTION ENGINE — default eVTOL")
print("=" * 108)

# --- atmosphere ----------------------------------------------------------
cr  = isa(APP['cruiseAlt'])
hov = isa(APP['hoverHeight'])          # field elev 0 + hover height
chk("rho cruise",      cr['rho'],  1.111643, "kg/m3")
chk("a cruise",        cr['a'],    336.434,  "m/s")
chk("Mach cruise",     APP['vCruise']/cr['a'], APP['Mach'], "-")
chk("rho hover",       hov['rho'], 1.22321,  "kg/m3")

# --- Reynolds / skin friction -------------------------------------------
Re_ref = cr['rho'] * APP['vCruise'] * APP['MAC'] / cr['mu']
chk("Re at MAC",       Re_ref, APP['Re_'], "-", "app uses a kinematic value as mu")
M = APP['vCruise']/cr['a']
chk("Cf at MAC",       skin_friction_turbulent(Re_ref, M),
                       skin_friction_turbulent(APP['Re_'], M), "-", "consequence of the above")

# --- hover power ---------------------------------------------------------
W    = APP['MTOW'] * G0
Thov = W / (1.0 - APP['download'])
P_ref = hover_power_momentum(Thov, APP['nPropHover'], APP['propDiam'],
                             hov['rho'], APP['etaHov'])
chk("hover power (with download)", P_ref/1000.0, APP['Phov'], "kW",
    "momentum theory, per-rotor T with per-rotor A")
P_nodl = hover_power_momentum(W, APP['nPropHover'], APP['propDiam'],
                              hov['rho'], APP['etaHov'])
chk("hover power (NO download)", P_nodl/1000.0, 532.236, "kW",
    "= what App.jsx Weather tab computes")

# --- cruise power --------------------------------------------------------
P_cr_ref = cruise_power(W, APP['vCruise'], APP['LDact'], APP['etaSys'])
chk("cruise power",    P_cr_ref/1000.0, APP['Pcr'], "kW", "W V /(L/D eta)")

# --- wing geometry -------------------------------------------------------
q  = dynamic_pressure(cr['rho'], APP['vCruise'])
S_ref = W / 1371.0                        # W/S design = 1371 N/m2
chk("wing area",       S_ref, APP['Swing'], "m2", "from the design wing loading")
AR = 9.0
b_ref = math.sqrt(AR * APP['Swing'])
chk("wing span",       b_ref, APP['bWing'], "m", "b = sqrt(AR S)")
taper = 0.45
Cr_ref = 2*APP['Swing']/(APP['bWing']*(1+taper))
MAC_ref = (2.0/3.0)*Cr_ref*(1+taper+taper**2)/(1+taper)
chk("MAC",             MAC_ref, APP['MAC'], "m", "tapered-wing MAC")
chk("cruise CL",       W/(q*APP['Swing']), 0.549481, "-")

# --- energy closure ------------------------------------------------------
Esum = APP['Eto']+APP['Ecl']+APP['Ecr']+APP['Edc']+APP['Eld']+APP['Eres']
chk("sum of segments", Esum, APP['Etot'], "kWh", "energy closure")
chk("pack nameplate",  APP['PackUsablekWh']/0.81, APP['PackkWh'], "kWh",
    "usable fraction 0.81 inferred")

# --- mass closure --------------------------------------------------------
chk("MTOW closure",    APP['Wempty']+APP['Wbat']+APP['payload'], APP['MTOW'], "kg")

# --- report -------------------------------------------------------------
print(f"{'quantity':<34}{'reference':>15}{'app':>15}{'unit':>8}{'app err %':>12}  note")
print("-"*108)
for name, ref, app, unit, rel, note in rows:
    flag = "" if abs(rel) < 0.5 else ("  <<<" if abs(rel) < 5 else "  <<<<<< ")
    print(f"{name:<34}{ref:>15.6g}{app:>15.6g}{unit:>8}{rel:>+12.3f}{flag}  {note}")
print("-"*108)
print("Rows within 0.5 % are treated as agreement (the app prints rounded values).")
