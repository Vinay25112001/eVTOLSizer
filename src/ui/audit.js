/* =====================================================================
   SELF-AUDIT — the checks a person makes by looking, made automatic
   =====================================================================
   Every interface defect found in this project so far was found the same
   way: somebody rendered a screen and looked at it. A 48 px dice emoji sat
   on the Monte Carlo tab through an entire emoji audit because it was
   below the fold in every screenshot taken. Grid lines were drawn in the
   panel-border colour for months. SC.dim was used as a text colour in 57
   places at 1.39:1 against its background.

   None of those are findable by reading code, and all of them are trivially
   findable from a rendered DOM with computed styles. That is what this
   does. It runs inside the real application — not a reconstruction of it —
   and reports what a careful reviewer would notice:

     CONTRAST      text below the WCAG AA ratio for its size, computed from
                   the actual resolved colours rather than from the tokens
                   someone intended to use.
     EMPTY CONTROLS  a button or link with no text, no accessible name and
                   no child image. These are the ones a screenshot cannot
                   show you, because there is nothing there to see.
     OVERFLOW      content wider than its scroll container, which is how a
                   table silently loses its last column.
     INVISIBLE TEXT  elements whose colour matches their own background.

   It is deliberately NOT a screenshot differ. Screenshots tell you that
   something changed; they do not tell you what is wrong, and they fail on
   every legitimate change. These are assertions about the rendered result.
   ===================================================================== */

/* ── colour maths, WCAG 2.1 relative luminance ─────────────────────── */
const srgb = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function parseColour(s) {
  if (!s) return null;
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  if (p.length < 3 || p.some((x) => !Number.isFinite(x))) return null;
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

const luminance = (c) =>
  0.2126 * srgb(c.r / 255) + 0.7152 * srgb(c.g / 255) + 0.0722 * srgb(c.b / 255);

const contrast = (a, b) => {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Composite a possibly-transparent colour over what is actually behind it. */
function effectiveBackground(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const cs = window.getComputedStyle(node);
    /* A GRADIENT PAINTS THE BOX AND REPORTS backgroundColor AS TRANSPARENT.
       Walking past it finds whatever is behind the element and compares the
       text against that, which is a background the reader never sees — an
       amber gradient button with near-black ink was reported at 1.09:1
       against the dark panel behind it. There is no single colour to compare
       against, so the honest answer is that this cannot be resolved. */
    if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
    const bg = parseColour(cs.backgroundColor);
    if (bg && bg.a > 0.95) return bg;
    node = node.parentElement;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

/* ── the audit ─────────────────────────────────────────────────────── */
export function auditDOM(context = {}) {
  const findings = [];
  const add = (kind, detail, el) =>
    findings.push({
      kind, detail,
      where: el ? (el.tagName.toLowerCase()
        + (el.id ? "#" + el.id : "")
        + (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "")) : "",
      text: el ? (el.textContent || "").trim().slice(0, 60) : "",
    });

  for (const el of document.querySelectorAll("body *")) {
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    /* --- controls that render nothing --- */
    const interactive = el.tagName === "BUTTON"
      || el.getAttribute("role") === "button"
      || (el.tagName === "A" && el.getAttribute("href"));
    if (interactive) {
      const label = (el.textContent || "").trim()
        || el.getAttribute("aria-label") || el.getAttribute("title") || "";
      const hasGraphic = el.querySelector("svg, img, canvas");
      if (!label && !hasGraphic)
        add("empty-control", "interactive element with no text, no aria-label and no graphic", el);
    }

    /* --- text contrast, on leaf text nodes only --- */
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(" ");
    if (ownText) {
      const fg = parseColour(cs.color);
      if (fg && fg.a > 0.1) {
        const bg = effectiveBackground(el);
        if (!bg) { add("unresolved-background",
          "painted with a gradient — contrast not computable from a single colour", el); }
        else {
        const ratio = contrast(fg, bg);
        const px = parseFloat(cs.fontSize) || 14;
        const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
        /* WCAG AA: 3:1 for large text (>=24px, or >=18.66px bold), else 4.5:1 */
        const large = px >= 24 || (bold && px >= 18.66);
        const need = large ? 3.0 : 4.5;
        if (ratio < need)
          add("contrast",
            `${ratio.toFixed(2)}:1 against ${need}:1 required at ${px.toFixed(0)}px`
            + `${bold ? " bold" : ""} — ${cs.color} on rgb(${bg.r},${bg.g},${bg.b})`, el);
        if (ratio < 1.15)
          add("invisible-text", `${ratio.toFixed(2)}:1 — text is the same colour as its background`, el);
        }
      }
    }

    /* --- content wider than the box that holds it --- */
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "auto" && cs.overflowX !== "scroll")
      add("overflow", `content ${el.scrollWidth}px in a ${el.clientWidth}px box with overflow-x:${cs.overflowX}`, el);
  }

  return { ...context, findings, counted: document.querySelectorAll("body *").length };
}

/** Run the audit and publish it where a headless dump can read it. */
export function publishAudit(context) {
  let out;
  try { out = auditDOM(context); }
  catch (e) { out = { ...context, error: String(e && e.message || e), findings: [] }; }
  const node = document.createElement("script");
  node.type = "application/json";
  node.id = "ui-audit";
  node.textContent = JSON.stringify(out);
  document.body.appendChild(node);
  return out;
}
