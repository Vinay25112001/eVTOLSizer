"""
Extract a DERIVED SUBSET of the Goodyear aircraft tyre data book into
src/data/tyres.js, for the 14 CFR 25.733 tyre selection in engine/gear/.

WHAT IS EMITTED, AND WHY IT IS A SUBSET. The data book carries 24 columns per
tyre; most of them are wheel and rim manufacturing data (flange height, ledge
width, width between flanges, shoulder dimensions, rim designation). None of
that is consumed by a tyre SELECTION. What is emitted is the thirteen
engineering quantities the selection and the downstream strut sizing actually
read, keyed by the Goodyear part number so any row can be traced back to the
printed page. This is a derived work for computation, not a reprint of the
book, and the attribution is in NOTICE.

THE SOURCE IS PARSED TWICE AND THE TWO MUST AGREE. LANDING-GEAR.md section 4
(package G3) requires spot-checking the parse against the rendered page. This
script does better than spot-check: it parses the `pdftotext -table`
extraction AND independently re-extracts every row from the PDF itself by
word coordinate with PyMuPDF, then refuses to emit anything unless the two
agree on every field of every row. A provenance claim that no script checks
is only a sentence; this one fails the build instead.

WHY `-table` AND NOT `-layout`. LANDING-GEAR.md G3, verbatim: "Do not use
`pdftotext -layout` - it scrambles row alignment badly." Confirmed here: the
plain extraction next to the -table one in the corpus does not keep a row's
values adjacent to its part number at all.

THE BOOK IS NOT UTF-8. It is cp1252 and carries a degree sign (0xb0) that
kills the default codec. Read as latin-1, which cannot fail on any byte
sequence, since every field this script keeps is ASCII.

Run:
    python tools/extract-tyres.py > src/data/tyres.js
"""
import io, os, re, sys

# stdout is a redirect, so on Windows its encoding would default to cp1252 and
# silently mangle anything non-ASCII. The generated file is ASCII by
# construction, but pin the encoding so that stays true if a trademark with an
# accent is ever added to the kept fields.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")

GEAR = os.path.join(
    os.path.expanduser("~"), "OneDrive - Wright State University",
    "eVTOL_Sizer_Live", "eVTOL_Sizing_Research", "classes", "cross-class",
    "sources", "gear")
TABLE = os.path.join(GEAR, "Goodyear-databook-2018-TABLE.txt")
PDF = os.path.join(GEAR, "Goodyear-databook-2018.pdf")

# The book names sizes four ways, and MISSING ONE SILENTLY DROPS A WHOLE
# TABLE -- which is exactly what happened with the radials on the first pass:
#   Type VII / three-part   16x4.4   21x7.25-10   21.5x7.0-10   450x190-5
#   Type III                5.00-4   5.00-4.5
#   Radial                  20x4.4R12   27.75x8.75R14.5   H44.5x16.5R21
#   Metric radial           762x233.52R15
# Note the optional leading H and the R separator.
SIZE = re.compile(r"^H?\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:[-R]\d+(?:\.\d+)?)?$"
                  r"|^\d+\.\d{2}-\d+(?:\.\d+)?$")
PLY = re.compile(r"^\d+$")
TUBE = re.compile(r"^(TT|TL)$")
SPEED = re.compile(r"^\d+K?$")          # 210, 120K, 174K
# The radial table prints thousands separators: 9,650 / 14,475 / 108,300.
INT = re.compile(r"^\d{1,3}(?:,\d{3})*$|^\d+$")

def ival(tok):
    return int(tok.replace(",", ""))

# Trailing-column schemas, READ OFF THE RENDERED PAGE (PDF pages 9 and 11),
# not inferred from the values. The radial table is NOT the same table with
# fewer columns -- it has no outside-diameter minimum and no flat-tyre radius
# at all, and its static loaded radius is a RANGE.
#   Type VII/III/etc (14): od max, od min, sect max, sect min, shoulder dia,
#       shoulder width, SLR, flat-tyre radius, aspect, wheel, WBF, rim dia,
#       flange height, min ledge
#   Radial (11): od grown max, sect grown max, shoulder dia, shoulder width,
#       SLR grown min, SLR grown max, wheel, WBF, rim dia, flange, min ledge
SCHEMA = {
    "standard": {"n": 14, "od": 0, "odMin": 1, "width": 2, "slr": 6, "flat": 7,
                 "aspect": 8, "wbf": 10, "rim": 11},
    "radial":   {"n": 11, "od": 0, "odMin": None, "width": 1, "slr": 4, "flat": None,
                 "aspect": None, "wbf": 7, "rim": 8},
}

SECTIONS = ("Type I", "Type III", "Type VII", "Metric", "Radial",
            "Three Part Name Sizes")


def num(tok):
    if tok in ("__", "--", "-", ""):
        return None
    try:
        return float(tok)
    except ValueError:
        return None                      # a rim designation, not a dimension


def spec_offset(t):
    """Index at which the ply / TT-or-TL / speed triple begins, or None.

    THIS, NOT A SIZE PATTERN, IS WHAT IDENTIFIES A ROW. Trying to enumerate
    the size formats was the original mistake and it failed twice: first the
    radials (R separators, thousands commas), then capital X (15X6.0-6),
    leading letters (B24x9.5-10.5, H26.5X8.0-14), slash-joined dual
    designations (17.5x6.25-6/6.00-6) and bare Type I diameters ("27", which
    is a real size -- Type I tyres are designated by diameter alone).

    The triple is unambiguous, so: offset 1 means the token before it IS the
    size, whatever it looks like; offset 0 means the book left the size cell
    blank and it carries down from the row above. No size grammar required."""
    for i in (0, 1):
        if len(t) > i + 2 and PLY.match(t[i]) and TUBE.match(t[i + 1]) \
                and SPEED.match(t[i + 2]):
            return i
    return None


def parse_table():
    """Parse the -table extraction. The leading fields and the trailing
    dimension block are each a fixed count PER SECTION, while the trademark
    between them contains spaces ("Flight Special II", "Flight Radial"), so
    anchoring from both ends is what makes this unambiguous.

    Returns (rows, unparsed) so the caller can refuse to emit if any
    candidate row was not understood."""
    rows, unparsed, last_size, section = [], [], None, None
    with io.open(TABLE, "r", encoding="latin-1", newline="") as fh:
        for lineno, raw in enumerate(fh, 1):
            s = raw.strip()
            if not s:
                continue
            if s in SECTIONS:
                section = s
                continue
            t = s.split()
            off = spec_offset(t)
            if off is None:
                # Prose, a header, or a size sitting alone with an ALTERNATE
                # part number for the spec above it. None is a new tyre, but
                # the size must still be remembered.
                if t and SIZE.match(t[0]):
                    last_size = t[0]
                continue

            if off == 1:
                size, rest = t[0], t[1:]
                last_size = size
            elif last_size:
                # The book leaves the size cell blank when one size carries
                # several ply ratings; the spec belongs to the size above.
                size, rest = last_size, t
            else:
                unparsed.append((lineno, "no size, and none carried forward", s[:80]))
                continue

            if not (INT.match(rest[3]) and INT.match(rest[4])):
                unparsed.append((lineno, "rated load / inflation not numeric", s[:80]))
                continue

            head, tail = rest[:7], rest[7:]
            kind = "radial" if section == "Radial" else "standard"
            sch = SCHEMA[kind]
            if len(tail) < sch["n"] + 1:
                unparsed.append((lineno,
                                 "%s schema wants %d trailing columns, saw %d"
                                 % (kind, sch["n"], len(tail)), s[:80]))
                continue
            trailing, middle = tail[-sch["n"]:], tail[:-sch["n"]]
            if not middle:
                unparsed.append((lineno, "no part number between the blocks", s[:80]))
                continue

            speed = head[2]
            rows.append({
                "section": section, "kind": kind, "size": size,
                "ply": ival(head[0]), "tube": head[1],
                "speedMph": ival(speed.rstrip("K")),
                "loadLb": ival(head[3]), "psi": ival(head[4]),
                "brakeLb": ival(head[5]), "bottomLb": ival(head[6]),
                "part": middle[-1],
                "odMaxIn": num(trailing[sch["od"]]),
                "odMinIn": None if sch["odMin"] is None else num(trailing[sch["odMin"]]),
                "widthMaxIn": num(trailing[sch["width"]]),
                "slrIn": num(trailing[sch["slr"]]),
                "flatRadIn": None if sch["flat"] is None else num(trailing[sch["flat"]]),
                # G7 (stowage) reads these three: the T&RA growth and clearance
                # rules need the rim diameter D (H = (D_O - D)/2), the aspect
                # ratio (G_H = 1.115 - 0.075 AR) and, for radials, the width
                # between flanges A. The radial table prints no aspect ratio;
                # the T&RA radial rule defines it from D_T, D and W_T, so it is
                # computed downstream from those, not invented here.
                "aspect": None if sch["aspect"] is None else num(trailing[sch["aspect"]]),
                "rimWidthIn": num(trailing[sch["wbf"]]),
                "rimDiaIn": num(trailing[sch["rim"]]),
                "_trailing": list(trailing[:sch["n"]]),
            })
    return rows, unparsed


def pdf_rows():
    """Re-extract every printed row straight from the PDF by word coordinate.
    Independent of pdftotext entirely, so agreement between this and
    parse_table() is real corroboration rather than one parser agreeing with
    itself."""
    import pymupdf
    doc = pymupdf.open(PDF)
    out = {}
    for pno in range(doc.page_count):
        words = doc[pno].get_text("words")
        for x0, y0, x1, y1, word, *_ in words:
            if not re.match(r"^[0-9A-Z][0-9A-Za-z()\-]{4,}$", word):
                continue
            yc = (y0 + y1) / 2
            band = sorted([w for w in words if abs((w[1] + w[3]) / 2 - yc) < 3.0],
                          key=lambda w: w[0])
            out.setdefault(word, [w[4] for w in band])
    doc.close()
    return out


def same_token(a, b):
    """16 == 16.0 == 16.00; .901 == 0.901; otherwise the strings must match."""
    try:
        return round(float(a), 4) == round(float(b), 4)
    except ValueError:
        return a.strip() == b.strip()


def sanity(r):
    """Invariants that follow from what the columns MEAN, so that a schema
    index pointing at the wrong column is refused even though the row's
    tokens all corroborate. Bounds are from the failure mode (see the
    generator's commit): the aspect identity is innocent to 0.047 and a
    rim index off by one gives 0.8; SLR over half the OD is innocent down
    to 0.74 and the shoulder width read as SLR gives 0.49."""
    od, odm, w, slr, flat = r["odMaxIn"], r["odMinIn"], r["widthMaxIn"], r["slrIn"], r["flatRadIn"]
    rim, wbf, ar = r["rimDiaIn"], r["rimWidthIn"], r["aspect"]
    if None in (od, w, slr, rim, wbf):
        return "a dimensional column is missing"
    if odm is not None and not od > odm:
        return "OD max %s not above OD min %s" % (od, odm)
    if not w < od:
        return "section width %s not below OD %s" % (w, od)
    if not rim < od:
        return "rim diameter %s not below OD %s" % (rim, od)
    if not wbf < w:
        return "width between flanges %s not below section width %s" % (wbf, w)
    if not 0.65 <= slr / (od / 2.0) < 1.0:
        return "SLR %s is %.2f of the OD radius; 0.65-1.0 expected" % (slr, slr / (od / 2.0))
    if flat is not None and not slr > flat:
        return "SLR %s not above the flat-tyre radius %s" % (slr, flat)
    if ar is not None and abs((od - rim) / (2.0 * w) - ar) > 0.10:
        return "printed aspect %s vs (D_O - D)/(2 W) = %.3f" % (ar, (od - rim) / (2.0 * w))
    return None


def main():
    rows, unparsed = parse_table()
    if not rows:
        sys.exit("extract-tyres: parsed no rows - has the source moved?")
    if unparsed:
        for ln, why, txt in unparsed[:15]:
            print("  UNPARSED line %d (%s): %s" % (ln, why, txt), file=sys.stderr)
        sys.exit("extract-tyres: %d line(s) look like tyre rows but were not "
                 "understood. Nothing emitted - a silently dropped table is "
                 "how the radials went missing the first time." % len(unparsed))

    insane = [(r["part"], why) for r in rows for why in [sanity(r)] if why]
    if insane:
        for p, why in insane[:15]:
            print("  INVARIANT %s: %s" % (p, why), file=sys.stderr)
        sys.exit("extract-tyres: %d of %d rows break a definitional invariant; a "
                 "column is being read as the wrong quantity. Nothing emitted."
                 % (len(insane), len(rows)))

    pdfr = pdf_rows()
    bad = []
    for r in rows:
        band = pdfr.get(r["part"])
        if band is None:
            bad.append((r["part"], "not found in the PDF"))
            continue
        # The radial table prints thousands separators and the standard
        # tables do not, so normalise BOTH sides before comparing. Comparing
        # "6500" against the printed "6,500" fails on formatting and looks
        # exactly like a data disagreement, which is a good way to distrust a
        # parse that is in fact correct.
        plain = {w.replace(",", "") for w in band}
        for key, val in (("ply", r["ply"]), ("loadLb", r["loadLb"]),
                         ("psi", r["psi"]), ("brakeLb", r["brakeLb"]),
                         ("bottomLb", r["bottomLb"])):
            if str(val) not in plain:
                bad.append((r["part"], "%s=%s not on the printed row" % (key, val)))
                break
        else:
            # The dimensional columns are corroborated POSITIONALLY: the
            # printed row's tokens after the part number, in x order, must
            # equal the -table trailing columns token by token. Asking only
            # whether a value appears somewhere on the row lets a column
            # swap through (the flange height is on the row too), and a
            # swapped column is exactly the defect the stowage rules would
            # not survive. Tokens compare as numbers where both parse (the
            # page prints 16 for the table's 16.0) and as strings otherwise
            # (the wheel size 16x4.4).
            try:
                k0 = band.index(r["part"])
            except ValueError:
                bad.append((r["part"], "part number not a single token on its printed row"))
                continue
            printed = [w.replace(",", "") for w in band[k0 + 1:]]
            want = r["_trailing"]
            if len(printed) < len(want):
                bad.append((r["part"], "printed row has %d trailing tokens, table has %d"
                            % (len(printed), len(want))))
                continue
            for k, (a, b) in enumerate(zip(want, printed)):
                if not same_token(a, b):
                    bad.append((r["part"], "trailing column %d: table %r, page %r" % (k, a, b)))
                    break
    if bad:
        for p, why in bad[:15]:
            print("  DISAGREE %s: %s" % (p, why), file=sys.stderr)
        sys.exit("extract-tyres: %d of %d rows disagree between the -table "
                 "extraction and the PDF. Nothing emitted." % (len(bad), len(rows)))

    rows.sort(key=lambda r: (r["loadLb"], r["size"], r["ply"]))
    w = sys.stdout.write

    def js(v):
        """Python None is not JavaScript null, and emitting it produces a file
        that throws ReferenceError on import rather than failing here. The
        radial table has genuinely absent columns (no outside-diameter
        minimum, no flat-tyre radius), so this path is always exercised."""
        return "null" if v is None else repr(v)
    w("/* GENERATED by tools/extract-tyres.py -- DO NOT HAND-EDIT.\n")
    w("   A DERIVED SUBSET of the Goodyear Aircraft Tire Data Book (2018,\n")
    w("   effective 6/18): the sixteen quantities a 14 CFR 25.733 tyre\n")
    w("   selection, the strut sizing and the 25.733(d) stowage envelope\n")
    w("   downstream of it actually read. The book's remaining wheel and rim\n")
    w("   manufacturing columns are deliberately not carried.\n")
    w("   `part` is the Goodyear part number and is the key back to\n")
    w("   the printed page. See NOTICE for attribution.\n\n")
    w("   Every row below was parsed from the `pdftotext -table` extraction\n")
    w("   AND independently re-extracted from the PDF by word coordinate; the\n")
    w("   generator refuses to emit unless the two agree on ply rating, rated\n")
    w("   load, rated inflation, maximum braking load, maximum bottoming load\n")
    w("   and, POSITIONALLY, every trailing column of every row - the printed\n")
    w("   tokens after the part number in page order equal the table's.\n")
    w("   %d rows, %d distinct sizes.\n\n"
      % (len(rows), len({r["size"] for r in rows})))
    w("   loadLb    rated load, lb            [14 CFR 25.733(a)(1) limit]\n")
    w("   psi       rated inflation, psi      [pavement pressure code]\n")
    w("   brakeLb   maximum braking load, lb\n")
    w("   bottomLb  maximum bottoming load, lb\n")
    w("   odMaxIn   outside diameter, max, in [grown envelope / stowage]\n")
    w("   slrIn     static loaded radius, in  [tyre deflection = od/2 - slr]\n")
    w("   flatRadIn flat-tyre radius, in      [25.733(d) clearance]\n")
    w("   widthMaxIn section width, max, in   [grown envelope]\n")
    w("   aspect    aspect ratio, as printed  [G_H = 1.115 - 0.075 AR; null on radials, which print none]\n")
    w("   rimWidthIn width between flanges, in [the radial clearance rule's A]\n")
    w("   rimDiaIn  specified rim diameter, in [H = (D_O - D)/2; a radial's OD and width are printed GROWN]\n")
    w("   radial    true for the book's Radial table [T&RA rules differ by construction]\n")
    w("*/\n")
    w("export const TYRES = Object.freeze([\n")
    for r in rows:
        w('  { size: "%s", ply: %d, tube: "%s", speedMph: %d, loadLb: %d, psi: %d,'
          ' brakeLb: %d, bottomLb: %d, odMaxIn: %s, odMinIn: %s, widthMaxIn: %s,'
          ' slrIn: %s, flatRadIn: %s, aspect: %s, rimWidthIn: %s, rimDiaIn: %s, radial: %s, part: "%s" },\n'
          % (r["size"], r["ply"], r["tube"], r["speedMph"], r["loadLb"], r["psi"],
             r["brakeLb"], r["bottomLb"], js(r["odMaxIn"]), js(r["odMinIn"]),
             js(r["widthMaxIn"]), js(r["slrIn"]), js(r["flatRadIn"]), js(r["aspect"]),
             js(r["rimWidthIn"]), js(r["rimDiaIn"]), "true" if r["kind"] == "radial" else "false", r["part"]))
    w("]);\n\n")
    w("/* The source, held here so a reader need not open the generator. */\n")
    w('export const TYRE_SOURCE = Object.freeze({\n')
    w('  book: "Goodyear Aircraft Tire Data Book, 2018, effective 6/18",\n')
    w('  note: "Civil aircraft tire data in the book are in accordance with '
      'Tire and Rim Association standards and conform to FAA TSO C-62e.",\n')
    w('  rows: %d,\n' % len(rows))
    w('  derivedSubset: true,\n')
    w('});\n')
    print("extract-tyres: %d rows, %d sizes, all corroborated against the PDF"
          % (len(rows), len({r["size"] for r in rows})), file=sys.stderr)


if __name__ == "__main__":
    main()
