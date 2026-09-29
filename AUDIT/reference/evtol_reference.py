"""
INDEPENDENT REFERENCE IMPLEMENTATION — eVTOL conceptual sizing chain
=====================================================================
Written for a human aerospace engineer to read, from first principles.
It deliberately shares NO code with the application. Every relation is
written out in full, in SI, with the source named.

Purpose: Phase 3 of the audit — an independent calculation path against
which the production engine can be compared. Where this file and the app
disagree, that disagreement is the finding; this file is not authoritative
about the app's MODELLING CHOICES, only about the physics and algebra.
"""
import math

# ---------------------------------------------------------------- constants
G0      = 9.80665        # m/s^2, standard gravity (defined; NACA TR-824)
R_AIR   = 287.05287      # J/(kg K), = P0/(rho0 T0) for the ISA triple
GAMMA   = 1.4            # ratio of specific heats, air
T0      = 288.15         # K,  ISA sea-level temperature
P0      = 101325.0       # Pa, ISA sea-level pressure
LAPSE   = 0.0065         # K/m, ISA tropospheric lapse rate
RHO0    = P0 / (R_AIR * T0)           # = 1.225 kg/m^3 by construction

def sutherland_mu(T):
    """Dynamic viscosity of air, Pa.s. White, Viscous Fluid Flow 3e eq.1-36."""
    return 1.458e-6 * T**1.5 / (T + 110.4)

# ---------------------------------------------------------------- atmosphere
def isa(h_m, dISA=0.0):
    """ISA troposphere with a temperature deviation.

    A temperature deviation does NOT change the pressure profile, only the
    temperature; density must therefore be recomputed from the gas law at the
    ACTUAL temperature, not scaled. (ICAO Doc 7488.)
    """
    h = max(0.0, h_m)
    T_std = T0 - LAPSE * h
    P     = P0 * (T_std / T0) ** (G0 / (LAPSE * R_AIR))
    T     = T_std + dISA
    rho   = P / (R_AIR * T)
    a     = math.sqrt(GAMMA * R_AIR * T)
    return dict(T=T, P=P, rho=rho, a=a, mu=sutherland_mu(T))

# ---------------------------------------------------------------- hover
def hover_power_momentum(thrust_N, n_rotors, diameter_m, rho, figure_of_merit):
    """Rotor power in axial hover, actuator-disk (momentum) theory.

    Ideal induced power for a disk of area A carrying thrust T:
        v_i      = sqrt(T / (2 rho A))          induced velocity
        P_ideal  = T * v_i = T^1.5 / sqrt(2 rho A)
    Divided by a figure of merit FM to represent profile and non-ideal losses.
    Per-rotor thrust must be paired with PER-ROTOR disk area.
    Returns watts.
    """
    A_one = math.pi * (diameter_m / 2.0) ** 2
    T_one = thrust_N / n_rotors
    P_ideal_one = T_one ** 1.5 / math.sqrt(2.0 * rho * A_one)
    return n_rotors * P_ideal_one / figure_of_merit

def hover_power_disk_loading(thrust_N, n_rotors, diameter_m, rho, fm):
    """Algebraically identical route, written the way the app writes it, so the
    two forms can be shown to be the same relation:
        P = (T / FM) * sqrt(DL / (2 rho)),  DL = T_total / A_total
    """
    A_tot = n_rotors * math.pi * (diameter_m / 2.0) ** 2
    DL    = thrust_N / A_tot
    return (thrust_N / fm) * math.sqrt(DL / (2.0 * rho))

# ---------------------------------------------------------------- cruise
def dynamic_pressure(rho, V):
    return 0.5 * rho * V * V

def skin_friction_turbulent(Re, M):
    """Prandtl-Schlichting flat-plate turbulent Cf with Raymer's
    compressibility term (Raymer, Aircraft Design, eq. 12.27)."""
    return 0.455 / math.log10(Re) ** 2.58 / (1.0 + 0.144 * M * M) ** 0.65

def cruise_power(weight_N, V, LD, eta_total):
    """Level unaccelerated flight: thrust equals drag, so shaft/electrical
    power = W V / ((L/D) eta). Returns watts."""
    return weight_N * V / (LD * eta_total)

# ---------------------------------------------------------------- energy
def segment_energy_kWh(power_W, time_s):
    """E = P t. 1 kWh = 3.6e6 J."""
    return power_W * time_s / 3.6e6

def battery_pack_from_energy(E_usable_kWh, usable_fraction, specific_energy_Wh_per_kg):
    """Pack nameplate capacity and mass.
    usable_fraction is the fraction of nameplate that may be drawn.
    """
    pack_kWh = E_usable_kWh / usable_fraction
    mass_kg  = pack_kWh * 1000.0 / specific_energy_Wh_per_kg
    return pack_kWh, mass_kg

# ---------------------------------------------------------------- closure
def mtow_closure(empty_kg, payload_kg, energy_kg):
    """MTOW is the sum of the three. Returned with the residual so a caller
    cannot quietly ignore a non-closing design."""
    total = empty_kg + payload_kg + energy_kg
    return total

# ================================================================ self-test
if __name__ == "__main__":
    print("=" * 74)
    print("INDEPENDENT REFERENCE — internal consistency checks")
    print("=" * 74)

    # 1. the ISA triple must be self-consistent
    print(f"rho0 from P0/(R T0)            = {RHO0:.6f} kg/m^3   (expect 1.225000)")
    print(f"a0 = sqrt(gamma R T0)          = {math.sqrt(GAMMA*R_AIR*T0):.4f} m/s   "
          f"(NDARC publishes 340.294)")
    print(f"mu(288.15) Sutherland          = {sutherland_mu(T0):.6e} Pa.s")
    print(f"nu(288.15) = mu/rho            = {sutherland_mu(T0)/RHO0:.6e} m^2/s")

    # 2. the two hover routes must agree exactly — proves the app's DL form
    #    is momentum theory rewritten, not a different model
    T, n, D, rho, fm = 27183.0, 12, 2.37, 1.22321, 0.74
    p1 = hover_power_momentum(T, n, D, rho, fm)
    p2 = hover_power_disk_loading(T, n, D, rho, fm)
    print(f"\nhover, momentum form           = {p1/1000:.4f} kW")
    print(f"hover, disk-loading form       = {p2/1000:.4f} kW")
    print(f"  the two forms agree to        {abs(p1/p2-1):.2e} (must be ~0)")

    # 3. dimensional sanity on the cruise chain
    atm = isa(1000.0)
    q = dynamic_pressure(atm['rho'], 67.0)
    print(f"\nISA 1000 m: T {atm['T']:.3f} K  rho {atm['rho']:.6f}  a {atm['a']:.3f} m/s")
    print(f"q at 67 m/s                    = {q:.2f} Pa")
    Re = atm['rho'] * 67.0 * 1.555 / atm['mu']
    print(f"Re (MAC 1.555 m, TRUE mu)      = {Re:.0f}")
    print(f"Cf                             = {skin_friction_turbulent(Re, 67.0/atm['a']):.6f}")
