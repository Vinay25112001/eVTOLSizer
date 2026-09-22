"""
Re-extract NASA's released OpenVSP .vsp3 models into the SI data in
src/data/vsp-models.js.

Run from a directory containing the unzipped models:
    python tools/extract-vsp3.py

WHY THIS EXISTS: src/data/vsp-models.js must never be hand-edited. Every number
in it came out of the XML through this script, so if NASA release a new version
the module is regenerated rather than retyped — which is the only way the claim
"the model IS the source" stays true.

UNITS ARE PINNED HERE, NOT READ FROM THE FILE. Each .vsp3 declares several
LenUnit parms belonging to different sub-containers and they disagree; RAVEN's
vehicle block ends on IN while its geometry is plainly FT, and taking the wrong
one scales an aircraft by 12x. The mapping below was determined from the
geometry itself — the Gear geoms carry `DiameterIn` = 12 in / 8 in tires on both
BD-6 and RAVEN, which are light-aircraft wheels; BD-6 at inches is the real Bede
BD-6 (6.71 m span); and each .glb bounding box matches its .vsp3 numbers with no
conversion. See the header of src/data/vsp-models.js.

TILT ARCHITECTURE is likewise read from the Hinge geoms: a rotor with no hinge
does not tilt. Both eVTOL models come out 4 tilt + 2 lift-only.

THE HINGES CARRY MORE THAN AN ON/OFF FLAG, and this script used to throw it
away. Each proprotor Hinge geom publishes its AXIS (PrimXVec/PrimYVec/PrimZVec
= 0/1/0, i.e. lateral), its TRAVEL (JointRotMin 0, JointRotMax 110 deg) and the
angle the model is RELEASED at (JointRotate = 90, which is helicopter mode per
Wright & Silva, corpus S3568). Because only `tilts` was read, the viewer had no
pivot to convert about and rotated each disc about its own hub instead, holding
the hub still — the wrong mechanism. `hinges` below now carries all of it.

THE GEAR GEOMS WERE ALSO BEING SKIPPED. The release carries Nose Gear, Nose
Gear Caster, Nose Gear Spar, Main Gear and Main Gear Struts, which is where the
gear stations come from. A comment in this project asserting that RAVEN
"publishes no gear geom" was written from a component list rather than from the
file, and was wrong.
"""
import re, json, glob, os
FT, IN = 0.3048, 0.0254
UNITS = {"BD-6_v03_004.vsp3": ("IN", IN), "RAVEN_v01_003_Release.vsp3": ("FT", FT),
         "RAVEN SWFT VSP Public Release.vsp3": ("FT", FT)}
TILT = {  # props WITHOUT a hinge are lift-only; from the Hinge geom names
 "RAVEN_v01_003_Release.vsp3": {"Prop1":1,"Prop2":1,"Prop3":1,"Prop4":1,"Prop5":0,"Prop6":0},
 "RAVEN SWFT VSP Public Release.vsp3": {"L Inboard Proprotor":1,"R Inboard Proprotor":1,
   "L Outboard Proprotor":1,"R Outboard Proprotor":1,"L Hover Proprotor":0,"R Hover Proprotor":0},
 "BD-6_v03_004.vsp3": {"Prop":0}}
def geoms(s):
    out, d, st = [], 0, None
    for m in re.finditer(r'</?Geom>', s):
        if m.group(0)=='<Geom>':
            if d==0: st=m.end()
            d+=1
        else:
            d-=1
            if d==0:
                b=s[st:m.start()]
                n=re.search(r'<Name>(.*?)</Name>',b); t=re.search(r'<TypeName>(.*?)</TypeName>',b)
                out.append((n.group(1) if n else "?", t.group(1) if t else "?", b))
    return out
def _taper(b):
    ch=[float(x) for x in re.findall(r'<Chord Value="([-0-9.eE+]+)"',b)]
    ch=[c for c in ch if c>1e-6]
    return (min(ch)/max(ch)) if ch else 1.0
def p1(b,k,dv=0.0):
    m=re.search(r'<'+k+r' Value="([-0-9.eE+]+)"',b); return float(m.group(1)) if m else dv
r=lambda v,n=4: round(v,n)
out={}
for f in sorted(glob.glob("*/*.vsp3")):
    base=os.path.basename(f); un,k=UNITS[base]
    s=open(f,encoding="utf-8",errors="replace").read(); gs=geoms(s)
    W=[g for g in gs if g[1]=="Wing"]; P=[g for g in gs if g[1]=="Propeller"]
    fus=[g for g in gs if g[1]=="Fuselage" and g[0].strip()=="Fuselage"]
    main=W[0]
    rot=[]
    for n,t,b in P:
        rot.append(dict(name=n, D_m=r(p1(b,"Diameter")*k), blades=int(p1(b,"NumBlade")),
          solidity=r(p1(b,"Solidity")),
          x_m=r(p1(b,"X_Location")*k), y_m=r(p1(b,"Y_Location")*k), z_m=r(p1(b,"Z_Location")*k),
          tilts=bool(TILT[base].get(n,0))))
    # Hinge geoms: axis, travel and released angle, not just presence.
    hinges=[]
    for n,t,bb in gs:
        if t!="Hinge": continue
        hinges.append(dict(name=n,
          x_m=r(p1(bb,"X_Location")*k), z_m=r(p1(bb,"Z_Location")*k),
          axis=[p1(bb,"PrimXVec",0), p1(bb,"PrimYVec",0), p1(bb,"PrimZVec",0)],
          travel_min_deg=p1(bb,"JointRotMin"), travel_max_deg=p1(bb,"JointRotMax"),
          released_deg=p1(bb,"JointRotate")))
    # Gear geoms: stations, and the tyre read off the wheel's own sections.
    gear=[]
    for n,t,bb in gs:
        if "Gear" not in n: continue
        cd=[float(x) for x in re.findall(r'<Circle_Diameter Value="([-0-9.eE+]+)"', bb)]
        gear.append(dict(name=n,
          x_m=r(p1(bb,"X_Location",0)*k), y_m=r(p1(bb,"Y_Location",0)*k),
          z_m=r(p1(bb,"Z_Location",0)*k),
          y_rot_deg=p1(bb,"Y_Rotation",0), length_m=r((p1(bb,"Length") or 0)*k),
          span_m=r((p1(bb,"TotalSpan") or 0)*k),
          tyre_dia_m=r(max(cd)*k) if cd else None,
          hub_dia_m=r(min(cd)*k) if cd else None))
    tails=[dict(name=n, span_m=r(p1(b,"TotalSpan")*k), area_m2=r(p1(b,"TotalArea")*k*k),
                AR=r(p1(b,"TotalAR"))) for n,t,b in W[1:]]
    out[base]=dict(unit=un, hinges=hinges, gear=gear,
      fuselage_len_m=r(p1(fus[0][2],"Length")*k) if fus else None,
      wing=dict(span_m=r(p1(main[2],"TotalSpan")*k), area_m2=r(p1(main[2],"TotalArea")*k*k),
                AR=r(p1(main[2],"TotalAR")), chord_m=r(p1(main[2],"TotalChord")*k),
                tc=r(p1(main[2],"ThickChord")), sweep_deg=r(p1(main[2],"Sweep"),2),
                dihedral_deg=r(p1(main[2],"Dihedral"),2), taper=r(_taper(main[2])),
                twist_deg=r(p1(main[2],"Twist"),2)),
      tails=tails, rotors=rot, nGeoms=len(gs))
json.dump(out, open("emit.json","w"), indent=1)
print(json.dumps(out, indent=1)[:2000])
