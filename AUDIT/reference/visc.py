import math
# Independent reference: Sutherland's law for air (White, Viscous Fluid Flow, 3rd ed, eq 1-36)
# mu = 1.458e-6 * T^1.5 / (T + 110.4)   [Pa.s], T in K
def sutherland(T): return 1.458e-6 * T**1.5 / (T + 110.4)

T0, RHO0, P0, RG = 288.15, 1.225, 101325.0, 287.05287
mu_isa = sutherland(T0)
print(f"Sutherland mu(288.15 K)      = {mu_isa:.6e} Pa.s")
print(f"ISA tabulated dynamic visc   = 1.7894e-05 Pa.s  (ICAO Doc 7488)")
print(f"kinematic nu = mu/rho        = {mu_isa/RHO0:.6e} m2/s")
print()
MU0_app = 1.47e-5
print(f"app MU0 (labelled Pa.s)      = {MU0_app:.6e}")
print(f"  ratio to dynamic  = {MU0_app/mu_isa:.4f}  -> app is {100*(1-MU0_app/mu_isa):.1f}% LOW vs dynamic")
print(f"  ratio to kinematic= {MU0_app/(mu_isa/RHO0):.4f}  -> matches KINEMATIC to {100*abs(1-MU0_app/(mu_isa/RHO0)):.2f}%")
print()
# Does the 0.75 power law fit DYNAMIC or KINEMATIC viscosity?
print("Power-law exponent test, 288.15 K -> 216.65 K (11 km):")
T1 = 216.65
print(f"  dynamic  ratio Sutherland = {sutherland(T1)/mu_isa:.5f}")
print(f"  (T1/T0)^0.75              = {(T1/T0)**0.75:.5f}   <- app's law")
# kinematic at 11km: rho from ISA
P1 = P0*(T1/T0)**(9.80665/(0.0065*RG))
rho1 = P1/(RG*T1)
print(f"  kinematic ratio (ISA)     = {(sutherland(T1)/rho1)/(mu_isa/RHO0):.5f}")
print()
# Impact on Cf (Prandtl-Schlichting as coded: 0.455/log10(Re)^2.58 / (1+0.144 M^2)^0.65)
def cf(Re, M): return 0.455/math.log10(Re)**2.58/(1+0.144*M*M)**0.65
for (V, L, alt_rho, M, tag) in [(70.0, 1.5, 1.225, 0.206, "eVTOL cruise, MAC 1.5 m, SL"),
                                 (70.0, 7.2, 1.225, 0.206, "eVTOL fuselage L 7.2 m, SL")]:
    Re_app  = alt_rho*V*L/MU0_app
    Re_true = alt_rho*V*L/mu_isa
    print(f"{tag}")
    print(f"  Re app  = {Re_app:.3e}   Re correct = {Re_true:.3e}   app HIGH by {100*(Re_app/Re_true-1):.1f}%")
    print(f"  Cf app  = {cf(Re_app,M):.6f}  Cf correct = {cf(Re_true,M):.6f}  app LOW by {100*(1-cf(Re_app,M)/cf(Re_true,M)):.2f}%")
