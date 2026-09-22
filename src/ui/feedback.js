/* =====================================================================
   TACTILE FEEDBACK — what is actually available to a web page
   =====================================================================
   HONEST SCOPE, STATED FIRST, because the request was "haptic feedback like
   iOS" and most of that is not deliverable from a browser:

     - iOS Safari does not implement the Vibration API. Apple's Taptic Engine
       is not exposed to web pages, so `navigator.vibrate` is undefined there
       and no polyfill can reach the hardware.
     - A desktop or laptop has no vibration motor at all. On the machine this
       tool is normally used from, the vibration path below will correctly do
       nothing.
     - Where it DOES work — Chrome and Firefox on Android — `navigator.vibrate`
       is real, and it is used here, feature-detected rather than assumed.

   So the vibration call is a bonus on the one platform that supports it, and
   the part that carries the "responsive, tactile" feeling everywhere else is
   VISUAL: a control that visibly yields when pressed, settles quickly, and
   shows where the keyboard is. That is what makes an interface feel direct on
   hardware that cannot buzz, and it is what pressCSS() below provides.

   Durations follow the pattern iOS uses for its own impact styles — a short
   single pulse for a selection, a longer one for a committing action, a
   double for a warning — rather than numbers picked here.
   ===================================================================== */

const PATTERN = {
  selection: 8,        // moving between tabs, toggling a segmented control
  impact:    14,       // a committing action: run, save, apply
  warning:   [10, 40, 10],  // something was refused or is out of limits
};

/** True only where the platform actually exposes vibration hardware. */
export const canVibrate = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/** Fire a tactile pulse if the platform has one. Silent no-op otherwise —
    never throws, never needs guarding at the call site. */
export function tap(kind = "selection") {
  if (!canVibrate()) return false;
  /* Someone who has asked for reduced motion has asked not to be buzzed. */
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return false;
    return navigator.vibrate(PATTERN[kind] ?? PATTERN.selection);
  } catch { return false; }
}

/** The part that works on every platform. Injected once, globally, so every
    control gains it without 200 call sites changing.

    - `:active` yields 1 px and dims very slightly — the press is SEEN
    - the settle is 90 ms, below the ~100 ms threshold at which a response
      stops feeling attached to the action that caused it
    - `:focus-visible` draws a ring for keyboard users only, so pointer users
      never see a stray outline
    - all of it collapses under prefers-reduced-motion */
export const pressCSS = (SC) => `
  button, [role="button"], .pressable {
    transition: transform 90ms cubic-bezier(.2,.8,.3,1),
                background-color 120ms ease, border-color 120ms ease, opacity 90ms ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  button:active:not(:disabled), [role="button"]:active, .pressable:active {
    transform: translateY(1px) scale(0.995);
    opacity: .92;
  }
  button:disabled { cursor: not-allowed; opacity: .5; }
  :focus-visible {
    outline: 2px solid ${SC.advisory};
    outline-offset: 2px;
    border-radius: 2px;
  }
  input[type=range] { touch-action: manipulation; }
  input[type=range]::-webkit-slider-thumb { transition: transform 90ms cubic-bezier(.2,.8,.3,1); }
  input[type=range]:active::-webkit-slider-thumb { transform: scale(1.15); }
  @media (prefers-reduced-motion: reduce) {
    button, [role="button"], .pressable,
    input[type=range]::-webkit-slider-thumb { transition: none; }
    button:active:not(:disabled), [role="button"]:active, .pressable:active,
    input[type=range]:active::-webkit-slider-thumb { transform: none; }
  }
`;
