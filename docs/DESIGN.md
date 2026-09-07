# Design Critique & Direction — Consolidated GT7 SaaS

Source: impeccable `critique` run (Assessment A design review + Assessment B detector), both dual-isolated sub-agents. Snapshot of run: 2026-09-07. Targets: gt7April globals.css/ui, Stitch globals.css/page, Pro material-theme.ts (source files; no dev server).

## Detector evidence (Assessment B)

- gt7April (3 targets): **clean** — 0 findings. Machine-clean on slop.
- GT7-Telemetry-Pro material-theme.ts: **clean**.
- gt7Telemetry26 globals.css: **2 confirmed warnings** (slop category):
  1. `gradient-text` .text-gradient — animated gradient heading, bot-style tell (globals.css:78).
  2. `bounce-easing` cubic-bezier(0.34,1.56,0.64,1) overshoot spring (globals.css:208).
  - plus one unflagged: `neon-text-glow` magenta text-shadow (no detector rule covers it).

## Heuristic scores (Nielsen 0–4, Operate-dashboard lens)

| World | Total |
|---|---|
| gt7April (violet oklch, shadcn/Base UI) | 23/40 — acceptable |
| Stitch (26) | 21/40 — acceptable-high (best racial) |
| MD3 (Pro) | 19/40 — acceptable-low |

## Design specificity

**Stitch ≫ gt7April ≥ MD3.** Only Stitch is race-native: live circuit position + ghost dot, pace-delta bars, S1–S3 deltas, tire-temp radial, ERS/fuel, "TELEMETRY ACTIVE" footer. gt7April is stock shadcn with a Gauge logo; MD3 is generic Material3.

## Assessment A findings

**gt7April.** Strengths: real token system (oklch 289.3 primary, dark 0.08 0.015 ramp, semantic surface/muted/accent, light+dark), cva/base-ui state discipline (ring-3 focus, aria-invalid), real IA (Sessions/Leaderboards/AI) + loading/error routes. Issues: [P1] two violets — landing hardcodes `bg-violet-600`/`from-violet-400` (hue≈267) vs token 289.3; [P1] specificity floor — any SaaS clones it; [P2] 6-item icon-only mobile bottom nav + 6+admin sidebar; [P2] no live-session status language (no heartbeat/PB/dead-rubber); [P3] flat emotional curve.

**Stitch (26).** Strengths: race-native HUD grammar + telemetry semantic colors (throttle/brake/coast, tire hot/warm/cold), trust-through-status (pulsing session dot), EN/PT/ES. Issues: [P1] two dialects (gradient landing vs HUD dashboard, all inline style); [P1] glass blur on white-on-glass multi-panel scanning; motion library (6+ animations) distracts mid-lap glance; [P2] zero error/empty/offline states evidenced; [P3] stock Helvetica.

**MD3 (Pro).** Strengths: 469-line token discipline (neutral 0–100 ramp, surface container ladder, elevation table, 8px grid, type scale, light/dark). Issues: [P1] stock #6200ea + Roboto — racing skin is decoration; [P1] racing.* palette is Material stock, unbound to telemetry semantics; [P1] default lightTheme against dark-first + 19 shadow copies; [P2] 886-line dashboard, 8-widget grid + demo banner; [P3] corp skeletons.

## Persona red flags

- Power user ("where's my delta now?" deeply buried in Stitch's 7+ panels; April has zero shortcuts; Pro banner+widget stack wastes glance time).
- Jordan: Pro demo-mode jargon; Stitch icon-only left rail; April's dual violet reads as a bug.
- Sam: Stitch glass contrast + color-only green pulse fails AA; Pro 400-weight titles flatten; April's ring-3 focus is the only clear a11y win.

## Consolidated direction (the design for the new product)

**Base: gt7April (Operate).** Token system, component discipline, IA, alive routes. Mandatory upgrades from the audit:
1. **Ingest Stitch's racing-language layer** — telemetry semantic colors (throttle green, brake red, coast amber, tire hot/cold), live-status pulses, pace-delta/sector/tire treatment. Without this, April inherits the specificity failure.
2. **Kill the slop** — no .text-gradient animation, no bounce-overshoot easing, no neon glow in the app shell. These survive only in Marketing (Persuade) if at all.
3. **Single violet** — fix landing's hardcoded `bg-violet-600` to the token (289.3) — one brand color, no two-hue drift.
4. **Reduce nav** — dashboard = top-level tabs (Dashboard / Sessions / Analysis / Leaderboards) not icon-only bottom nav; settings behind avatar.
5. **Live status language** — every telemetry surface gets: heartbeat indicator, PB delta vs last/best, connection state (connected/waiting/offline/reconnecting), sector splits. One glance, no reading.
6. **Tire/temp treatment** — radial or grid with hot/warm/cold bake (from Stitch mockups, gt7April tire_temps data already exists).

**Marketing (Persuade) only: Stitch world** — glass, gradient, racespeed; landing + pricing page. Strictly separate from Operate app.

**Take from MD3: only token discipline** — neutral ramp, elevation ladder; never its look, never Roboto, never #6200ea.

**Typography:** JetBrains Mono for telemetry numerals (keep), Inter/UI sans for body (April), one display voice for marketing (Orbitron-fit, to be chosen).

**Modes per surface:** Dashboard/Sessions/Analysis/Leaderboards/Settings = Operate. Landing/Pricing = Persuade. Docs = Read. Reduce to 4 visible options max per decision point; keyboard-navigable charts; ARIA on gauges; prefers-reduced-motion honored.

## What to preserve from each repo's design assets

| Asset | From | Fate |
|---|---|---|
| Tailwind v4 oklch token system + Base UI components | gt7April | inherit as-is |
| Telemetry semantic color vocabulary + race HUD grammar | Stitch mockups | port into April tokens |
| Pace-delta bars, sector split, tire radial | Stitch mockups | port as components |
| Live session status language (pulse, heartbeat, footer) | Stitch | port |
| MD3 token discipline (neutral ramp, elevation) | Pro | concept only |
| Light/dark + reduced-motion + ring-3 focus | April | keep |
| i18n EN/PT/ES | Stitch | keep |
