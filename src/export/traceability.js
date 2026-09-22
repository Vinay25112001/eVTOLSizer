/* =====================================================================
   REQUIREMENTS TRACEABILITY — every criterion the design was checked
   against, where it comes from, and what the tool found
   =====================================================================
   One row per engine check, as CSV, so a requirements tool or a
   spreadsheet can import it. The source column is the citation text the
   check itself carries ([SRC ...] tags and regulatory paragraph numbers);
   a check that cites nothing says so rather than being given a source.

   This is a plain traceability matrix. It is NOT a ReqIF document: ReqIF
   1.2 compliance requires implementing the whole exchange model (OMG
   formal/2016-07-01 §2), which an export-only subset does not.
   ===================================================================== */

const SOURCE_PATTERNS = [
  /\[SRC[^\]]*\]/g,
  /\bMOC VTOL\.\d{4}(?:\([a-z0-9]+\))*/g,
  /\bVTOL\.\d{4}(?:\([a-z0-9]+\))*/g,
  /\b(?:CS|FAR|14 CFR) ?-?\d{2}\.\d+(?:\([a-z0-9]+\))*/g,
  /\bPL\.\d{4}(?:\([a-z0-9]+\))*/g,
  /\bAC 21\.17-4\b/g,
  /\bSC-VTOL(?:-\d+)?(?: Issue \d+)?/g,
  /\bNASA[\/ -](?:TM|TP|CR|STD)[-\w.]+/g,
  /\bNDARC\b[^;,.)]*?(?:\d+-\d+(?:\.\d+)*)/g,
  /\bADS-33\w*/g,
  /\bMIL-[A-Z]-\d+\w*/g,
];

export function citationsIn(text) {
  const found = new Set();
  for (const re of SOURCE_PATTERNS) for (const m of String(text ?? "").matchAll(re)) found.add(m[0].trim());
  return [...found];
}

const KIND = { undefined: "criterion", advisory: "advisory criterion", omission: "modelling omission", indeterminate: "indeterminate" };

export function traceabilityRows(R) {
  return (R?.checks || []).map((c, i) => {
    const cites = citationsIn(`${c.label} ${c.val ?? ""}`);
    return {
      id: `CHK-${String(i + 1).padStart(3, "0")}`,
      criterion: c.label,
      type: KIND[c.kind] ?? c.kind,
      result: c.ok ? "met" : "NOT met",
      evaluation: c.val ?? "",
      sources: cites.length ? cites.join("; ") : "(no source cited by the check)",
    };
  });
}

const cell = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

/** CSV text. `meta` goes into leading comment-style rows so the file says
    which design and engine it describes. */
export function traceabilityCSV(R, { inputHash = "", engine = "", layout = "" } = {}) {
  const rows = traceabilityRows(R);
  const head = ["id", "criterion", "type", "result", "evaluation", "sources"];
  const met = rows.filter(r => r.result === "met").length;
  const lines = [
    [cell("# eVTOL Sizer requirements traceability"), cell(`engine ${engine}`), cell(`layout ${layout}`), cell(`input hash ${inputHash}`),
     cell(`${met} of ${rows.length} met`), cell("")].join(","),
    head.map(cell).join(","),
    ...rows.map(r => head.map(h => cell(r[h])).join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
}
