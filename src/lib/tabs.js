/* =====================================================================
   TAB REGISTRY — 29 tabs, and where a person is meant to look
   =====================================================================
   Two things were wrong here, and both were navigation problems rather than
   cosmetic ones.

   THE ICONS CARRIED NO INFORMATION AND SOME OF IT WAS FALSE. Every tab wore a
   geometric glyph from TABI. Of 29, exactly three meant anything -- a gear for
   Propulsion, an arrow for Performance, a plus-minus for Uncertainty. The rest
   were circled and squared mathematical operators, and at the 11 px they were
   drawn at, a ring with a dot (Certification) and a ring with a ring (Noise)
   are the same object. Worse, FOUR GLYPHS WERE USED TWICE: Overview and Design
   Navigator both took a lozenge, Monte Carlo and Components both a boxed plus,
   Cost and Design Space both a boxed minus, Mission Builder and W&B Envelope
   both a circled plus. An icon that appears on two different destinations is
   not a weak icon, it is a wrong one.

   So the glyph column is gone. The label is the affordance; it was already
   carrying the whole meaning, and it now gets the width the glyph was taking.

   THE GROUP NAMES DID NOT DESCRIBE THEIR CONTENTS. "Simulation" held a mission
   EDITOR, an atmosphere TABLE, a regulatory CHANGELOG and an AI CHAT -- not
   one of which simulates anything. "Design Navigator" was the label on
   AIAssistantPanel, so the single feature most likely to help someone who is
   lost sat behind a name that does not say so, inside a group that does not
   contain it. Certification and Reg Tracker -- what the rules demand, and how
   they changed -- were in different groups. Mission and Mission Builder were
   in different groups. Three tabs beginning "Design" were spread across three
   groups, so remembering the name did not tell you where to look.

   The five groups now read left to right as the order the work is actually
   done in, which is the only structure a first-time user can infer without
   being told:

     Design      what I am asking for, and the aircraft that meets it
     Physics     does it close, and does it fly
     Trades      how sensitive is it, and what else could I have built
     Compliance  what the rules require of it
     Tools       parts, references, export and help

   Noise sits under Compliance rather than with the other analyses because its
   own panel states that its values feed the FAA/EASA compliance checker; the
   number matters because a limit exists.
   ===================================================================== */
/* Tabs 16 and 17 were "Reference Aircraft" and "Design Archive". The first
   also holds the design version history and the published configurations;
   the second held only the live collaboration panel, so a user looking for
   the archive opened a collaboration session instead (found writing
   docs/USER-GUIDE.md, 2026-09-16). Named for what they contain. */
export const TABS=["Overview","Mission","Wing & Aero","Propulsion","Battery","Performance","Stability","V-Tail","Convergence","Monte Carlo","Certification","Noise","Cost","Mission Builder","Weather & Atmos","OpenVSP","Designs & References","Collaboration","V-n Diagram","Design Space","BEM Rotor","Reg Tracker","AI Assistant","W&B Envelope","Components","Constraint Diagram","Compare Layouts","Uncertainty","NASA VSP Models"];

/* Ordered WITHIN each group by the sequence the question is asked in, not by
   tab index -- Convergence leads Physics because "did it close" precedes every
   other physics question, and Overview leads Design because it is the answer
   the rest of the group explains.

   No `color` field. Each group used to carry its own hex, so the primary
   navigation was five competing hues before any DATA had been coloured, and
   all five were dark-theme values shown in both themes. The bar is monochrome
   now and a group's identity is its name. */
export const TAB_GROUPS=[
  {label:"Design",     tabs:[0,1,13,14,2,3,4,7]},
  {label:"Physics",    tabs:[8,5,6,23,18,25,20]},
  {label:"Trades",     tabs:[19,26,9,27,12]},
  {label:"Compliance", tabs:[10,11,21]},
  {label:"Tools",      tabs:[24,16,28,15,17,22]},
];

/* The keys these groups are actually bound to in App.jsx. Kept as data so the
   tooltip cannot drift from the binding -- it used to name the group by index
   in a chain of ternaries, which would have gone on saying "Analysis" after
   the group was renamed. */
export const GROUP_KEYS=["Ctrl+D","Ctrl+P","Ctrl+A","Ctrl+Q","Ctrl+B"];

/* TTP is defined inside App() so it reads the current C theme */

/* ═══════════════════════════════════
   APP
   ═══════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   DESIGN SPACE EXPLORER — Latin Hypercube Sampling + Pareto Front
   ══════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════
   BEM ROTOR SOLVER — Blade Element Momentum Theory
   Computes spanwise thrust/torque distribution, tip losses (Prandtl),
   wake contraction, figure of merit vs collective pitch.
   Ref: Leishman "Principles of Helicopter Aerodynamics" Ch.3
   ════════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════════
   FEATURE 9 — CROSS-SECTION PREVIEW PANEL
   Renders fuselage cross-section and wing airfoil as inline SVG.
   ════════════════════════════════════════════════════════════════════════ */
