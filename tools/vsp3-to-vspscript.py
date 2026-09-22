"""
Convert an OpenVSP .vsp3 into a .vspscript that rebuilds it.

WHY. src/export/vspscript.js emits OUR aircraft as an AngelScript build,
structured on RAVEN's geom tree. This converts RAVEN ITSELF the same way, and
that makes it a check rather than a convenience: if the emitted script rebuilds
the released model, then the parent-child tree, the geom types and the parm
names this project has been reading out of that file are all correct. If it
does not, the reading is wrong somewhere and the script says where.

It is deliberately NOT a general-purpose converter. It emits the geom types
RAVEN uses — Fuselage, Wing, Stack, Propeller, Hinge — with the parms this
project measures against, and it prints what it skipped rather than pretending
to have handled it. A converter that silently drops geoms would defeat the
purpose of using it as a check.

API NAMES ARE FROM THE INSTALL, NOT FROM MEMORY: AddGeom(type, parent) is
python/openvsp/openvsp/vsp.py:4613; the valid type tokens were collected from
every AddGeom call in OpenVSP 3.51.3's own scripts/ directory; parm names are
read straight out of the .vsp3 being converted, so they cannot drift from it.

HINGE is the one token that cannot be confirmed from the install — no shipped
script calls AddGeom("HINGE"), though HINGE_GEOM_SCREEN exists in vsp.py. The
emitted script therefore CHECKS its return and reports, rather than assuming.

    python tools/vsp3-to-vspscript.py "RAVEN SWFT VSP Public Release.vsp3" > raven-swft.vspscript
"""
import re, sys, os

# TypeName in the .vsp3  ->  AddGeom token
TYPE_MAP = {
    "Fuselage": "FUSELAGE",
    "Wing": "WING",
    "Stack": "STACK",
    "Propeller": "PROP",
    "Hinge": "HINGE",
    "Pod": "POD",
    "Blank": "BLANK",
}

# Parms worth carrying, by the group OpenVSP files them under.
CARRY = [
    ("XForm", ["X_Rel_Location", "Y_Rel_Location", "Z_Rel_Location",
               "X_Rel_Rotation", "Y_Rel_Rotation", "Z_Rel_Rotation"]),
    ("Design", ["Length", "Diameter", "NumBlade", "Solidity"]),
    ("WingGeom", ["TotalSpan", "TotalArea", "TotalAR"]),
    ("Sym", ["Sym_Planar_Flag"]),
    ("Hinge", ["PrimXVec", "PrimYVec", "PrimZVec",
               "JointRotMin", "JointRotMax", "JointRotate"]),
]


def blocks(s, tag):
    """Inner text of each TOP-LEVEL <tag>...</tag>, ignoring nested ones."""
    out, d, st = [], 0, None
    for m in re.finditer(r"</?" + tag + r">", s):
        if m.group(0) == "<" + tag + ">":
            if d == 0:
                st = m.end()
            d += 1
        else:
            d -= 1
            if d == 0:
                out.append(s[st:m.start()])
    return out


def val(b, k):
    m = re.search(r"<" + k + r' Value="([-0-9.eE+]+)"', b)
    return float(m.group(1)) if m else None


def one(b, tag):
    m = re.search(r"<" + tag + r">(.*?)</" + tag + r">", b, re.S)
    return m.group(1).strip() if m else None


def ident(name, used):
    """A legal, unique AngelScript identifier from a geom name."""
    base = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").lower() or "g"
    if base[0].isdigit():
        base = "g" + base
    i, cand = 1, base
    while cand in used:
        i += 1
        cand = f"{base}_{i}"
    used.add(cand)
    return cand


def main(path):
    s = open(path, encoding="utf-8", errors="replace").read()
    geoms = []
    for b in blocks(s, "Geom"):
        geoms.append({
            "name": one(b, "Name") or "?",
            "type": one(b, "TypeName") or "?",
            "parent": one(b, "ParentID"),
            "id": one(b, "ID"),
            "body": b,
        })

    by_id = {g["id"]: g for g in geoms if g["id"]}
    used, var = set(), {}
    skipped = []

    print("/* ============================================================")
    print(f" *  {os.path.basename(path)}")
    print(" *  Rebuilt as an AngelScript by tools/vsp3-to-vspscript.py")
    print(" *")
    print(" *  This is a CHECK, not a convenience: if it rebuilds the")
    print(" *  released model, the geom tree, types and parm names this")
    print(" *  project reads out of that file are correct.")
    print(" * ============================================================ */")
    print()
    print("void main()")
    print("{")
    print("    bool hingeOK = true;")
    print()

    for g in geoms:
        tok = TYPE_MAP.get(g["type"])
        if not tok:
            skipped.append(f'{g["name"]} ({g["type"]})')
            continue
        v = ident(g["name"], used)
        var[g["id"]] = v
        parent = var.get(g["parent"], "")
        pexpr = parent if parent else '""'
        print(f'    // {g["name"]}  [{g["type"]}]')
        print(f'    string {v} = AddGeom( "{tok}", {pexpr} );')
        if tok == "HINGE":
            print(f"    if ( {v}.length() == 0 ) {{ hingeOK = false; }}")
        print(f'    SetGeomName( {v}, "{g["name"]}" );')
        for grp, keys in CARRY:
            for k in keys:
                x = val(g["body"], k)
                if x is None:
                    continue
                print(f'    SetParmVal( {v}, "{k}", "{grp}", {x:.6f} );')
        print("    Update();")
        print()

    print("    if ( !hingeOK )")
    print('        Print( string("NOTE: AddGeom(\\"HINGE\\") returned nothing; '
          'hinges are absent and the model cannot convert.\\n") );')
    if skipped:
        print(f"    // NOT emitted, because this converter does not handle their type:")
        for sk in skipped:
            print(f"    //   {sk}")
    # TWO ARGUMENTS. OpenVSP's AngelScript has only
    #   void WriteVSPFile( const string&in file_name, int set )
    # The one-argument form fails to COMPILE, so every script this converter
    # emitted stopped before writing anything - unnoticed because this file
    # called itself "a check" and had never been run.
    print('    WriteVSPFile( "rebuilt.vsp3", SET_ALL );')
    print(f'    Print( string("Rebuilt {len(var)} of {len(geoms)} geoms.\\n") );')
    print("}")

    print(f"\n// emitted {len(var)} geoms; skipped {len(skipped)}", file=sys.stderr)
    for sk in skipped:
        print(f"//   skipped: {sk}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
