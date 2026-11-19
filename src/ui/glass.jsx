/* =====================================================================
   GLASS COCKPIT: the frame's surface layer (liquid glass)
   =====================================================================
   One stylesheet for the three studios (eVTOL, aircraft, drone), rendered
   ONCE by classes/Root.jsx. Each studio used to inject its own copy; the
   copy of a hidden studio kept applying, so the page could be styled for
   a theme that no visible studio was showing.

   The design is "glass cockpit": see-through frosted panes over a faint
   aviation chart, with tactile (skeuomorphic) treatment kept to the things
   a pilot actually touches or reads off a panel: keycaps, recessed
   switches, display windows, annunciator lamps. Data stays flat.

   LIQUID GLASS, as in the SysML and AI-literacy course sites:
     - the reader sets how see-through the panes are (--glass-a) and how
       much they frost (--glass-blur) in the profile pop-up (lib/display.js
       writes both on <html>);
     - each pane has a specular edge: a lit rim and a soft diagonal glint;
     - a highlight follows the pointer across a pane (--mx, --my, written
       by useGlassSheen below, once per animation frame at most);
     - pop-ups open with a short spring (the profile card) or by rising out
       of a blur (dialogs).
   Reading surfaces (cards holding numbers) never get more see-through than
   they were (72 %): the reader's glass setting only makes them more solid.
   The frame panes go down to 45 %, over a blurred backdrop.

   WHY ::before. The frame's glass is painted by a ::before layer, never by
   the element itself. An element with backdrop-filter becomes the
   containing block of its position:fixed descendants, which would trap the
   app's dialogs inside the header or the input rail. The pattern is the
   SysML course frame's (571ba30). For the ::before layers to sit above the
   backdrop and below the content, the studio root must be a stacking
   context: it carries `gc-backdrop`, which sets isolation:isolate.

   Fallbacks, all required: prefers-reduced-transparency and the reader's
   "Solid panels" make every pane opaque with no blur (theme.js makes the
   cards opaque too); forced colours drop the backdrop and draw plain
   system borders; print drops the glass; prefers-reduced-motion and the
   reader's "Less motion" stop the animations and the pointer highlight.
   ===================================================================== */
import { useEffect, useId } from "react";
import { SC } from "../lib/theme.js";
import {
  useDarkMode, useDisplay, setDisplay, resetDisplay, toggleDark, isDarkPref, GLASS_MIN, FROST_MAX,
} from "../lib/display.js";

/* The backdrop is drawn, not photographed: terrain contours, two airspace
   rings and a dashed route between two vertiports. Every stroke is under
   20 % alpha, so it textures the glass without competing with data. */
function chartSVG(dark) {
  const contour = dark ? "rgb(96 150 190 / 0.10)" : "rgb(30 80 120 / 0.09)";
  const ring = dark ? "rgb(140 180 215 / 0.12)" : "rgb(30 80 120 / 0.10)";
  const route = dark ? "rgb(214 226 238 / 0.18)" : "rgb(11 21 36 / 0.14)";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">`
    + `<g fill="none" stroke="${contour}" stroke-width="1">`
    + `<path d="M-40 210 C 180 150, 320 260, 560 190 S 980 90, 1180 170 S 1440 250, 1520 190"/>`
    + `<path d="M-40 262 C 190 202, 330 312, 570 244 S 990 144, 1190 224 S 1450 304, 1520 244"/>`
    + `<path d="M-40 640 C 220 580, 420 720, 700 650 S 1100 540, 1520 620"/>`
    + `<path d="M-40 696 C 230 636, 430 776, 710 706 S 1110 596, 1520 676"/>`
    + `</g><g fill="none" stroke="${ring}" stroke-width="1">`
    + `<circle cx="1160" cy="300" r="190"/><circle cx="1160" cy="300" r="300" stroke-dasharray="2 7"/>`
    + `<circle cx="260" cy="700" r="150"/><circle cx="260" cy="700" r="240" stroke-dasharray="2 7"/>`
    + `</g><path d="M260 700 C 520 560, 860 420, 1160 300" fill="none" stroke="${route}" stroke-width="1.5" stroke-dasharray="8 8"/>`
    + `<g fill="none" stroke="${route}" stroke-width="1.5"><circle cx="260" cy="700" r="12"/><circle cx="1160" cy="300" r="12"/></g>`
    + `</svg>`;
}

/** The CSS for the current theme. Read SC after the theme is applied
    (lib/display.js does it before any engine renders). */
export function glassCSS(dark) {
  const uri = `url("data:image/svg+xml,${encodeURIComponent(chartSVG(dark))}")`;
  const lamp = (c, glow) =>
    `background:radial-gradient(circle at 35% 30%, color-mix(in srgb, ${c} 35%, white), ${c} 50%, color-mix(in srgb, ${c} 55%, black));`
    + `box-shadow:0 0 0 1px ${dark ? "rgb(0 0 0 / 0.55)" : "rgb(20 40 60 / 0.30)"}${glow ? `, 0 0 8px color-mix(in srgb, ${c} 55%, transparent)` : ""};`;
  const keyBg = dark ? "linear-gradient(#1D2836, #141D29)" : "linear-gradient(#FFFFFF, #EEF2F6)";
  const keyEdge = dark ? "#273547" : "#CBD5DF";
  const keyFoot = dark ? "#0A1018" : "#A9B7C5";
  const keyOn = dark ? "linear-gradient(#63DCF0, #3EBFD7)" : "linear-gradient(#1A86B6, #0B6E99)";
  const wellBg = dark ? "#070C13" : "#E9EEF3";
  const sunk = dark
    ? "inset 0 2px 5px rgb(0 0 0 / 0.65), inset 0 0 0 1px rgb(255 255 255 / 0.04)"
    : "inset 0 2px 4px rgb(20 40 60 / 0.14), inset 0 0 0 1px rgb(20 40 60 / 0.05)";
  const lcdBg = dark ? "#04080D" : "#EDF1F5";
  /* the pane colour as rgb channels (theme.js panel, #101722 / #FFFFFF), so
     the alpha can be the reader's variable */
  const paneRGB = dark ? "16 23 34" : "255 255 255";
  /* specular edge and pointer highlight, per theme */
  const glint = dark ? "rgb(255 255 255 / 0.05)" : "rgb(255 255 255 / 0.45)";
  const glintFoot = dark ? "rgb(255 255 255 / 0.025)" : "rgb(255 255 255 / 0.20)";
  const sheen = dark ? "255 255 255 / calc(var(--sheen, 0) * 0.075)" : "255 255 255 / calc(var(--sheen, 0) * 0.75)";
  const sheenCard = dark ? "255 255 255 / calc(var(--sheen, 0) * 0.05)" : "255 255 255 / calc(var(--sheen, 0) * 0.6)";
  const glow = dark ? "rgb(79 209 232 / 0.05)" : "rgb(11 110 153 / 0.05)";
  const glow2 = dark ? "rgb(167 139 250 / 0.035)" : "rgb(109 40 217 / 0.03)";
  const specular = `linear-gradient(140deg, ${glint}, transparent 34%, transparent 72%, ${glintFoot})`;
  const sheenAt = (rgb) => `radial-gradient(280px circle at var(--mx, 30%) var(--my, -30%), rgb(${rgb}), transparent 70%)`;
  const scrim = dark ? "rgb(2 6 12 / 0.55)" : "rgb(20 40 60 / 0.22)";
  return `
  /* the pointer highlight's position and strength: registered so they do
     not inherit (moving it restyles one pane, not every node inside it)
     and so the strength can fade */
  @property --mx { syntax: "<length-percentage>"; inherits: false; initial-value: 30%; }
  @property --my { syntax: "<length-percentage>"; inherits: false; initial-value: -30%; }
  @property --sheen { syntax: "<number>"; inherits: false; initial-value: 0; }
  :root { --glass-a: 0.62; --glass-blur: 18px; --glass-rgb: ${paneRGB}; }
  /* an author !important beats the inline value lib/display.js writes */
  :root[data-surface="solid"] { --glass-a: 1 !important; --glass-blur: 0px !important; }
  @media (prefers-reduced-transparency: reduce) {
    :root { --glass-a: 1 !important; --glass-blur: 0px !important; }
  }
  html, body { background: ${SC.page}; }
  .gc-backdrop {
    isolation: isolate;
    background-color: ${SC.page};
    background-image: radial-gradient(55% 50% at 82% 8%, ${glow}, transparent 70%),
      radial-gradient(45% 45% at 6% 96%, ${glow2}, transparent 70%), ${uri};
    background-size: cover;
    background-position: center;
  }
  /* ── frame glass ── */
  .gc-glass {
    position: relative;
    background: transparent !important;
    border: 1px solid ${SC.rim};
    border-radius: 14px;
    box-shadow: inset 0 1px 0 ${SC.rimHi}, 0 24px 48px -28px ${SC.shade};
  }
  .gc-glass::before {
    --mx: inherit; --my: inherit; --sheen: inherit;
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: ${sheenAt(sheen)}, ${specular}, rgb(var(--glass-rgb) / var(--glass-a));
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(160%);
    backdrop-filter: blur(var(--glass-blur)) saturate(160%);
    pointer-events: none;
  }
  .gc-glass:hover, .gc-card:hover, .gc-pop:hover { --sheen: 1; }
  /* A floating layer (menu, popover, tooltip) over content: blurred itself,
     because nothing fixed-position lives inside one. Never under 90 %
     opaque: it floats over text. */
  .gc-float {
    -webkit-backdrop-filter: blur(max(var(--glass-blur), 12px)) saturate(160%);
    backdrop-filter: blur(max(var(--glass-blur), 12px)) saturate(160%);
    box-shadow: inset 0 1px 0 ${SC.rimHi}, 0 24px 48px -20px ${SC.shade} !important;
  }
  .recharts-tooltip-wrapper .recharts-default-tooltip {
    -webkit-backdrop-filter: blur(14px) saturate(150%);
    backdrop-filter: blur(14px) saturate(150%);
  }
  /* A card inside the frame holds numbers: lit edge and glint, the pointer
     highlight, and never more see-through than 72 %. The images are
     !important because the card's inline background shorthand clears them. */
  .gc-card {
    background-color: rgb(var(--glass-rgb) / max(var(--glass-a) + 0.1, 0.72)) !important;
    background-image: ${sheenAt(sheenCard)}, ${specular} !important;
    box-shadow: inset 0 1px 0 ${SC.rimHi}, 0 16px 32px -26px ${SC.shade};
  }

  /* ── pop-ups: the profile card, dialogs and their scrim ── */
  .gc-pop {
    position: absolute; top: calc(100% + 10px); right: -4px; z-index: 300;
    width: min(360px, calc(100vw - 24px)); max-height: min(78dvh, 700px);
    overflow: auto; overscroll-behavior: contain;
    padding: 16px; border-radius: 18px; text-align: left;
    border: 1px solid ${SC.rim};
    background: ${sheenAt(sheenCard)}, ${specular}, rgb(var(--glass-rgb) / max(var(--glass-a), 0.9));
    -webkit-backdrop-filter: blur(max(var(--glass-blur), 12px)) saturate(160%);
    backdrop-filter: blur(max(var(--glass-blur), 12px)) saturate(160%);
    box-shadow: inset 0 1px 0 ${SC.rimHi}, 0 30px 60px -20px ${SC.shade};
    color: ${SC.text}; font: 13px/1.45 'IBM Plex Sans', system-ui, sans-serif;
    transform-origin: top right;
  }
  .gc-scrim {
    position: fixed; inset: 0; z-index: 1000;
    display: grid; place-items: center; padding: 16px;
    background: ${scrim};
  }
  .gc-scrim::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    -webkit-backdrop-filter: blur(6px) saturate(120%);
    backdrop-filter: blur(6px) saturate(120%);
  }
  .gc-dialog {
    position: relative;
    width: min(440px, 100%); max-height: calc(100dvh - 32px); overflow: auto;
    border-radius: 20px; border: 1px solid ${SC.rim};
    background: ${specular}, rgb(var(--glass-rgb) / max(var(--glass-a), 0.92));
    -webkit-backdrop-filter: blur(max(var(--glass-blur), 14px)) saturate(160%);
    backdrop-filter: blur(max(var(--glass-blur), 14px)) saturate(160%);
    box-shadow: inset 0 1px 0 ${SC.rimHi}, 0 40px 80px -24px ${SC.shade};
    color: ${SC.text}; font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  .gc-dialog-wide { width: min(640px, 100%); }
  .gc-icon-btn {
    appearance: none; display: inline-grid; place-items: center;
    width: 32px; height: 32px; border-radius: 9px; flex: none;
    border: 1px solid transparent; background: transparent; color: ${SC.muted}; cursor: pointer;
  }
  .gc-icon-btn:hover { color: ${SC.text}; border-color: ${SC.rim}; background: rgb(var(--glass-rgb) / 0.5); }
  .gc-field {
    width: 100%; box-sizing: border-box; min-height: 38px; padding: 8px 12px;
    border-radius: 10px; border: 1px solid ${dark ? "#243345" : "#C9D3DD"};
    background: ${wellBg}; box-shadow: ${sunk};
    color: ${SC.text}; font: 13px 'IBM Plex Sans', system-ui, sans-serif; outline: none;
  }
  .gc-field:focus { border-color: ${SC.accent}; box-shadow: ${sunk}, 0 0 0 3px color-mix(in srgb, ${SC.accent} 18%, transparent); }
  .gc-field::placeholder { color: ${SC.subtle}; }
  .gc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .gc-spin { animation: gc-spin 0.8s linear infinite; }
  @keyframes gc-spin { to { transform: rotate(360deg); } }
  .gc-link {
    appearance: none; border: 0; padding: 0; background: none; cursor: pointer;
    color: ${SC.accent}; font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px;
  }

  /* the profile card's parts (the SysML course's pop-up, in this palette) */
  .pf-wrap { position: relative; display: inline-flex; }
  .pf-avatar {
    display: grid; place-items: center; flex: none;
    width: 34px; height: 34px; border-radius: 50%; padding: 0;
    border: 2px solid ${SC.accent};
    background: radial-gradient(circle at 30% 25%, ${dark ? "#2C4A63, #16283A 55%, #0C1724" : "#3C8DB8, #0B6E99 55%, #084D6B"});
    color: #FFFFFF; font: 600 13px/1 'IBM Plex Sans', system-ui, sans-serif;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.30), 0 3px 8px ${dark ? "rgb(0 0 0 / 0.5)" : "rgb(20 40 60 / 0.25)"};
    cursor: pointer;
  }
  .pf-avatar.is-big { width: 50px; height: 50px; font-size: 17px; cursor: default; }
  .pf-avatar:focus-visible { outline: 3px solid ${SC.accent}; outline-offset: 2px; }
  .pf-who { display: flex; gap: 12px; align-items: center; }
  .pf-who h2 { margin: 0; font-size: 16px; font-weight: 600; color: ${SC.text}; }
  .pf-who p { margin: 2px 0 0; color: ${SC.muted}; font-size: 12.5px; overflow-wrap: anywhere; }
  .pf-h { margin: 14px 0 6px; color: ${SC.muted}; font: 600 11px/1.2 'IBM Plex Sans', system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
  .pf-card {
    display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px;
    border: 1px solid ${SC.rim}; background: rgb(var(--glass-rgb) / 0.55);
  }
  .pf-muted { color: ${SC.muted}; }
  .pf-menu { display: grid; gap: 2px; margin: 10px 0 0; padding: 0; list-style: none; }
  .pf-menu button {
    appearance: none; width: 100%; display: flex; align-items: center; gap: 10px;
    min-height: 36px; padding: 0 10px; border-radius: 10px; border: 1px solid transparent;
    background: transparent; color: ${SC.text}; font: 500 13px 'IBM Plex Sans', system-ui, sans-serif;
    text-align: left; cursor: pointer;
  }
  .pf-menu button:hover { background: rgb(var(--glass-rgb) / 0.6); border-color: ${SC.rim}; }
  .pf-menu button svg { color: ${SC.muted}; flex: none; }
  .pf-menu .is-danger { color: ${SC.warning}; }
  .pf-menu .is-danger svg { color: ${SC.warning}; }
  .pf-slider { display: grid; grid-template-columns: 1fr auto; gap: 0 10px; align-items: center; padding: 2px 0 6px; }
  .pf-slider label { grid-column: 1 / -1; font-size: 12.5px; color: ${SC.text}; }
  .pf-slider output { min-width: 3.6em; text-align: right; font: 500 12px 'IBM Plex Mono', ui-monospace, monospace; color: ${SC.muted}; }
  /* Drawn, not native: Edge's own range track is near-white and vanished
     on day glass. A sunken well, filled with the accent up to the knob
     (--fill is set on the input). */
  .pf-slider input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 0; background: transparent; cursor: pointer; }
  .pf-slider input[type="range"]::-webkit-slider-runnable-track {
    height: 6px; border-radius: 3px; box-shadow: ${sunk};
    background: linear-gradient(90deg, ${SC.accent} var(--fill, 50%), ${wellBg} var(--fill, 50%));
  }
  .pf-slider input[type="range"]::-moz-range-track { height: 6px; border-radius: 3px; background: ${wellBg}; box-shadow: ${sunk}; }
  .pf-slider input[type="range"]::-moz-range-progress { height: 6px; border-radius: 3px; background: ${SC.accent}; }
  .pf-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -5px; border-radius: 50%;
    background: ${keyOn}; border: 2px solid ${SC.panelSolid}; box-shadow: 0 1px 4px ${SC.shade};
  }
  .pf-slider input[type="range"]::-moz-range-thumb {
    width: 14px; height: 14px; border-radius: 50%; background: ${keyOn}; border: 2px solid ${SC.panelSolid}; box-shadow: 0 1px 4px ${SC.shade};
  }
  .pf-slider input[type="range"]:focus-visible { outline: 3px solid ${SC.accent}; outline-offset: 2px; border-radius: 6px; }
  .pf-slider input[type="range"]:disabled { cursor: default; opacity: 0.45; }
  .pf-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 5px 0; }
  .pf-lbl { font-size: 12.5px; color: ${SC.text}; }
  .pf-lbl small { display: block; color: ${SC.muted}; font-size: 11.5px; }
  .pf-seg { display: inline-flex; padding: 3px; border-radius: 10px; background: ${wellBg}; box-shadow: ${sunk}; }
  .pf-seg button {
    appearance: none; border: 0; background: transparent; color: ${SC.muted};
    font: 500 12px 'IBM Plex Sans', system-ui, sans-serif; padding: 0 10px; min-height: 28px; border-radius: 8px; cursor: pointer;
  }
  .pf-seg button[aria-pressed="true"] { color: ${SC.accentInk}; background: ${keyOn}; font-weight: 600; }
  /* a cockpit toggle switch: the lever points down for off and up for on */
  .pf-switch {
    position: relative; flex: none; width: 40px; height: 40px; border: 0; border-radius: 10px; cursor: pointer;
    background: radial-gradient(circle at 50% 50%, #3A4350 0 8px, #1B222B 9px, #4A5563 13px, #262E38 20px);
    box-shadow: inset 0 1px 1px rgb(255 255 255 / 0.22), 0 3px 6px rgb(0 0 0 / 0.35);
  }
  .pf-switch::after {
    content: ""; position: absolute; left: 50%; top: 50%; width: 9px; height: 19px; margin-left: -4.5px;
    border-radius: 5px; background: linear-gradient(90deg, #8D96A2, #F2F5F8 45%, #9AA3AE);
    transform-origin: 50% 0%; transform: rotate(160deg); box-shadow: 0 2px 3px rgb(0 0 0 / 0.5);
  }
  .pf-switch[aria-checked="true"]::after { transform: rotate(20deg); }
  .pf-switch[aria-checked="true"] { box-shadow: inset 0 1px 1px rgb(255 255 255 / 0.22), 0 3px 6px rgb(0 0 0 / 0.35), 0 0 0 2px ${SC.accent}; }
  .pf-foot { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid ${SC.border}; color: ${SC.muted}; font-size: 11.5px; }

  /* ── motion: short, and only when the reader allows it ── */
  @media (prefers-reduced-motion: no-preference) {
    :root:not([data-motion="calm"]) .gc-glass::before,
    :root:not([data-motion="calm"]) .gc-card,
    :root:not([data-motion="calm"]) .gc-pop { transition: --sheen 0.4s ease; }
    :root:not([data-motion="calm"]) .gc-pop { animation: gc-pop-in 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.15); }
    :root:not([data-motion="calm"]) .gc-scrim { animation: gc-fade-in 0.18s ease-out; }
    :root:not([data-motion="calm"]) .gc-dialog { animation: gc-liquid-in 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.08); }
    :root:not([data-motion="calm"]) .pf-switch::after { transition: transform 0.18s; }
    :root:not([data-motion="calm"]) .gc-key { transition: transform 0.12s ease, border-color 0.15s ease; }
    :root:not([data-motion="calm"]) .gc-key:active:not(:disabled) { transform: translateY(1px) scale(0.98); }
  }
  @keyframes gc-pop-in { from { opacity: 0; transform: scale(0.95) translateY(-6px); } }
  @keyframes gc-fade-in { from { opacity: 0; } }
  @keyframes gc-liquid-in { from { opacity: 0; transform: translateY(10px) scale(0.97); filter: blur(6px); } }
  :root[data-motion="calm"] *, :root[data-motion="calm"] *::before, :root[data-motion="calm"] *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }

  /* ── tactile parts ── */
  .gc-well { background: ${wellBg}; box-shadow: ${sunk}; border-radius: 10px; }
  .gc-lcd { background: ${lcdBg}; border-radius: 7px; box-shadow: ${dark
    ? "inset 0 1px 3px rgb(0 0 0 / 0.85), inset 0 0 0 1px rgb(255 255 255 / 0.05)"
    : "inset 0 1px 3px rgb(20 40 60 / 0.18), inset 0 0 0 1px rgb(20 40 60 / 0.05)"}; }
  .gc-key {
    appearance: none;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-height: 32px; padding: 0 12px;
    font: 500 12px/1 'IBM Plex Sans', system-ui, sans-serif; letter-spacing: 0.01em;
    color: ${SC.text};
    background: ${keyBg};
    border: 1px solid ${keyEdge}; border-bottom-color: ${keyFoot}; border-radius: 8px;
    box-shadow: inset 0 1px 0 ${dark ? "rgb(255 255 255 / 0.08)" : "#FFFFFF"}, 0 1px 2px ${dark ? "rgb(0 0 0 / 0.55)" : "rgb(20 40 60 / 0.14)"};
    cursor: pointer; white-space: nowrap; text-decoration: none;
  }
  .gc-key:hover:not(:disabled) { border-color: ${dark ? "#35485E" : "#B4C2D0"}; }
  .gc-key:disabled { opacity: 0.55; cursor: default; }
  .gc-key-on, .gc-key[aria-pressed="true"] {
    color: ${SC.accentInk};
    background: ${keyOn};
    border-color: ${dark ? "#2AA9C2" : "#095A7D"}; border-bottom-color: ${dark ? "#17798E" : "#063F58"};
    box-shadow: inset 0 1px 0 rgb(255 255 255 / ${dark ? 0.45 : 0.30}), 0 0 0 3px color-mix(in srgb, ${SC.accent} 14%, transparent);
  }
  /* A key sitting in a recessed switch (gc-well): flat until chosen. */
  .gc-well > .gc-key:not(.gc-key-on):not([aria-pressed="true"]) {
    background: transparent; border-color: transparent; box-shadow: none; color: ${SC.muted};
  }
  .gc-well > .gc-key:not(.gc-key-on):not([aria-pressed="true"]):hover { color: ${SC.text}; }
  .gc-lamp { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
  .gc-lamp[data-state="nominal"]  { ${lamp(SC.nominal, true)} }
  .gc-lamp[data-state="caution"]  { ${lamp(SC.caution, true)} }
  .gc-lamp[data-state="warning"]  { ${lamp(SC.warning, true)} }
  .gc-lamp[data-state="advisory"] { ${lamp(SC.advisory, true)} }
  .gc-lamp[data-state="off"]      { ${lamp(dark ? "#2A3542" : "#B9C4CF", false)} }
  .gc-eyebrow {
    font: 600 11px/1.2 'IBM Plex Sans', system-ui, sans-serif;
    letter-spacing: 0.08em; text-transform: uppercase; color: ${SC.muted};
  }
  .gc-num { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

  /* ── navigation ── */
  .gc-tab {
    appearance: none; background: none; border: 0; border-bottom: 2px solid transparent;
    color: ${SC.muted}; font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 11px 2px 9px; cursor: pointer; white-space: nowrap;
  }
  .gc-tab:hover { color: ${SC.text}; }
  .gc-tab[aria-current="true"] { color: ${SC.text}; font-weight: 600; border-bottom-color: ${SC.accent}; }
  .gc-sub {
    appearance: none; background: none; border: 1px solid transparent; border-radius: 8px;
    color: ${SC.muted}; font: 500 12px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 0 11px; min-height: 30px; cursor: pointer; white-space: nowrap;
  }
  .gc-sub:hover { color: ${SC.text}; }
  .gc-sub[aria-current="page"] {
    color: ${SC.text}; background: ${wellBg}; box-shadow: ${sunk};
    border-color: color-mix(in srgb, ${SC.accent} 40%, transparent);
  }

  :focus-visible { outline-color: ${SC.accent}; }
  ::selection { background: color-mix(in srgb, ${SC.accent} 30%, transparent); }
  ::-webkit-scrollbar-thumb { background: ${dark ? "#25323F" : "#C3CDD7"}; border-radius: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }

  :root[data-surface="solid"] .gc-glass::before,
  :root[data-surface="solid"] .gc-card,
  :root[data-surface="solid"] .gc-pop,
  :root[data-surface="solid"] .gc-dialog { background-image: none !important; }
  :root[data-surface="solid"] .gc-float,
  :root[data-surface="solid"] .gc-pop,
  :root[data-surface="solid"] .gc-dialog,
  :root[data-surface="solid"] .gc-glass::before { -webkit-backdrop-filter: none; backdrop-filter: none; }
  @media (prefers-reduced-transparency: reduce) {
    .gc-glass::before { background: ${SC.panelSolid}; -webkit-backdrop-filter: none; backdrop-filter: none; }
    .gc-float, .gc-pop, .gc-dialog, .gc-scrim::before, .recharts-tooltip-wrapper .recharts-default-tooltip { -webkit-backdrop-filter: none; backdrop-filter: none; }
    .gc-card, .gc-pop, .gc-dialog { background-image: none !important; }
  }
  @media (forced-colors: active) {
    .gc-backdrop { background-image: none; }
    .gc-glass, .gc-pop, .gc-dialog { border: 1px solid CanvasText; }
    .gc-glass::before { display: none; }
    .gc-lamp, .pf-switch { forced-color-adjust: none; }
  }
  @media print {
    .gc-backdrop { background: none; }
    .gc-glass { box-shadow: none; border-color: #999; }
    .gc-glass::before, .pf-wrap { display: none; }
  }
  `;
}

/** The one <style> for the three studios; classes/Root.jsx renders it. */
export function GlassStyle({ dark }) {
  return <style data-glass="">{glassCSS(dark)}</style>;
}

/* The pointer highlight: one listener for the page, at most one update per
   animation frame, writing the pointer's position on the pane under it
   (and on the card under it, if any). Off for touch, for reduced motion
   and for the reader's "Less motion". */
export function useGlassSheen() {
  const { calm } = useDisplay();
  useEffect(() => {
    if (calm || typeof window === "undefined" || typeof document === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;
    let raf = 0;
    let last = null;
    const run = () => {
      raf = 0;
      const t = last?.target;
      if (!t || typeof t.closest !== "function") return;
      for (const el of [t.closest(".gc-card"), t.closest(".gc-glass"), t.closest(".gc-pop")]) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${Math.round(last.clientX - r.left)}px`);
        el.style.setProperty("--my", `${Math.round(last.clientY - r.top)}px`);
      }
    };
    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      last = e;
      if (!raf) raf = window.requestAnimationFrame(run);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [calm]);
}

const SunIcon = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
);
const MoonIcon = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
);

/** Day / Night: the same key in all three studios, one theme for all. */
export function DayNightKey({ style }) {
  const dark = useDarkMode();
  return (
    <button type="button" className="gc-key" onClick={toggleDark} style={style}
      title={dark ? "Switch to day (light) mode" : "Switch to night (dark) mode"}>
      {dark ? <SunIcon /> : <MoonIcon />}
      {dark ? "Day" : "Night"}
    </button>
  );
}

function Switch({ label, hint, on, set }) {
  const id = useId();
  return (
    <div className="pf-row">
      <span className="pf-lbl" id={id}>{label}<small>{hint}</small></span>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className="pf-switch" onClick={() => set(!on)} />
    </div>
  );
}

/** The reader's display settings, for the profile card. Saved in this
    browser only (lib/display.js). */
export function DisplaySettings() {
  const prefs = useDisplay();
  const gid = useId();
  const fid = useId();
  const tid = useId();
  const dark = isDarkPref(prefs);
  return (
    <section aria-labelledby={`${gid}-h`}>
      <h3 className="pf-h" id={`${gid}-h`}>Display</h3>
      <div className="pf-row">
        <span className="pf-lbl" id={tid}>Theme<small>{prefs.theme === "system" ? `Following your computer (${dark ? "night" : "day"})` : dark ? "Night" : "Day"}</small></span>
        <span className="pf-seg" role="group" aria-labelledby={tid}>
          {[["light", "Day"], ["dark", "Night"], ["system", "System"]].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={prefs.theme === v} onClick={() => setDisplay({ theme: v })}>{l}</button>
          ))}
        </span>
      </div>
      <div className="pf-slider">
        <label htmlFor={gid}>Glass: how solid the panels are</label>
        <input id={gid} type="range" min={GLASS_MIN} max={100} step={1} value={prefs.glass} disabled={prefs.solid}
          style={{ "--fill": `${((prefs.glass - GLASS_MIN) / (100 - GLASS_MIN)) * 100}%` }}
          onChange={(e) => setDisplay({ glass: Number(e.target.value) })} data-testid="display-glass" />
        <output htmlFor={gid}>{prefs.glass} %</output>
      </div>
      <div className="pf-slider">
        <label htmlFor={fid}>Frost: how much the background blurs</label>
        <input id={fid} type="range" min={0} max={FROST_MAX} step={1} value={prefs.frost} disabled={prefs.solid}
          style={{ "--fill": `${(prefs.frost / FROST_MAX) * 100}%` }}
          onChange={(e) => setDisplay({ frost: Number(e.target.value) })} data-testid="display-frost" />
        <output htmlFor={fid}>{prefs.frost} px</output>
      </div>
      <Switch label="Solid panels" hint="No glass, highest contrast" on={prefs.solid} set={(solid) => setDisplay({ solid })} />
      <Switch label="Less motion" hint="No pop-up animation or pointer highlight" on={prefs.calm} set={(calm) => setDisplay({ calm })} />
      <p className="pf-foot">
        Saved in this browser only. Your computer's "reduce transparency" and "reduce motion" settings always apply.{" "}
        <button type="button" className="gc-link" onClick={resetDisplay}>Reset display</button>
      </p>
    </section>
  );
}
