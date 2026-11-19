/* =====================================================================
   DISPLAY PREFERENCES — one theme for the whole tool
   =====================================================================
   WHY ONE STORE. Root keeps the eVTOL sizer, the aircraft studio and the
   drone studio mounted at once, and each used to hold its own day/night
   state. All three write the one shared palette (theme.js SC), so the
   engine that rendered last chose the colours for the other two. Press
   Night in the sizer, open the aircraft studio (which started from the
   system setting), come back: the sizer's frame was day and its cards
   were night, 39 day-coloured cards on a night page (measured in Edge,
   2026-11-18). Each also injected its own copy of the glass stylesheet,
   and a hidden studio's copy kept applying. Nothing was saved, so a
   reload forgot the choice. The choice is now held once, here, saved in
   this browser, and every engine reads it.

   What is held: the theme (day, night, or the system's), how see-through
   the glass is, how much it frosts, solid panels, and less motion. They
   are written to <html> as data attributes and CSS custom properties that
   ui/glass.jsx reads, so the glass sliders restyle the page without a
   React render of every card.

   Theme precedence: ?theme= in the address (links and tests), then the
   saved choice, then the system setting. With no window at all (the node
   render gates) it is night, as it always was.

   Saved in this browser only (localStorage, every access guarded: a
   private window or blocked storage just means nothing is remembered).
   ===================================================================== */
import { useSyncExternalStore } from "react";
import { SC, applyTheme } from "./theme.js";

const KEY = "evtol-display";
export const GLASS_MIN = 45;
export const FROST_MAX = 30;
export const DISPLAY_DEFAULTS = Object.freeze({ theme: "system", glass: 62, frost: 18, solid: false, calm: false });

const hasWindow = typeof window !== "undefined";
const clampNum = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);

function sanitize(p = {}) {
  const out = {};
  if (["system", "dark", "light"].includes(p.theme)) out.theme = p.theme;
  if (p.glass != null) out.glass = clampNum(p.glass, GLASS_MIN, 100, DISPLAY_DEFAULTS.glass);
  if (p.frost != null) out.frost = clampNum(p.frost, 0, FROST_MAX, DISPLAY_DEFAULTS.frost);
  if (p.solid != null) out.solid = !!p.solid;
  if (p.calm != null) out.calm = !!p.calm;
  return out;
}

function readSaved() {
  try { return sanitize(JSON.parse(window.localStorage.getItem(KEY) || "{}") || {}); } catch { return {}; }
}
function readAddress() {
  try {
    const q = new URLSearchParams(window.location?.search || "").get("theme");
    return q === "dark" || q === "light" ? { theme: q } : {};
  } catch { return {}; }
}

let prefs = hasWindow ? { ...DISPLAY_DEFAULTS, ...readSaved(), ...readAddress() } : { ...DISPLAY_DEFAULTS };
const subscribers = new Set();
const notify = () => subscribers.forEach((f) => f());

function systemDark() {
  try {
    return hasWindow && typeof window.matchMedia === "function"
      ? !!window.matchMedia("(prefers-color-scheme: dark)")?.matches : true;
  } catch { return true; }
}

/** Night or day, for these preferences (the system's when the theme is "system"). */
export function isDarkPref(p = prefs) {
  return p.theme === "dark" ? true : p.theme === "light" ? false : systemDark();
}
export function getDisplay() { return prefs; }

/* Writes the palette, then the page: data attributes and custom properties
   on <html> that the glass stylesheet reads. */
function paint() {
  const dark = isDarkPref();
  applyTheme(dark, { solid: prefs.solid });
  if (typeof document === "undefined" || !document.documentElement) return;
  const h = document.documentElement;
  h.dataset.theme = dark ? "dark" : "light";
  h.style.colorScheme = dark ? "dark" : "light";
  /* index.html paints this before the scripts load, so a night page does
     not flash white; it is kept in step here */
  h.style.backgroundColor = SC.page;
  h.dataset.surface = prefs.solid ? "solid" : "glass";
  if (prefs.calm) h.dataset.motion = "calm"; else delete h.dataset.motion;
  h.style.setProperty("--glass-a", String(prefs.glass / 100));
  h.style.setProperty("--glass-blur", `${prefs.frost}px`);
}

/* A Day/Night choice made on the page outranks a ?theme= the page was
   opened with: the address one is dropped, so a reload keeps the choice. */
function dropAddressTheme() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("theme")) return;
    q.delete("theme");
    const s = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`);
  } catch { /* no address to tidy */ }
}

export function setDisplay(patch) {
  if (patch && "theme" in patch) dropAddressTheme();
  prefs = { ...prefs, ...sanitize(patch) };
  try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* not remembered */ }
  paint();
  notify();
}
/** The Day/Night key: an explicit choice, so it stops following the system. */
export function toggleDark() { setDisplay({ theme: isDarkPref() ? "light" : "dark" }); }
export function resetDisplay() {
  try { window.localStorage.removeItem(KEY); } catch { /* nothing saved */ }
  dropAddressTheme();
  prefs = { ...DISPLAY_DEFAULTS };
  paint();
  notify();
}
export function subscribeDisplay(f) { subscribers.add(f); return () => subscribers.delete(f); }

if (hasWindow) {
  paint();
  try {
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
      if (prefs.theme !== "system") return;
      prefs = { ...prefs };
      paint(); notify();
    });
  } catch { /* an old browser: the system theme is read at load only */ }
  /* Another tab of the tool changed the display: follow it. */
  window.addEventListener?.("storage", (e) => {
    if (e.key !== KEY) return;
    prefs = { ...DISPLAY_DEFAULTS, ...readSaved() };
    paint(); notify();
  });
}

/** The display preferences, re-rendering the caller when they change. */
export function useDisplay() { return useSyncExternalStore(subscribeDisplay, getDisplay, getDisplay); }
/** True for night. Every engine reads this one value. */
export function useDarkMode() { return isDarkPref(useDisplay()); }
