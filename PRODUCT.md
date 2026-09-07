# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive — one product with a responsive web app (Next.js) and a native mobile capture app (iOS/Android; Expo React Native), plus optional native SwiftUI iOS capture.  [inferred from GT7_Data spec: "Target platforms: iPhone and Android"]

## Stack

delegated — recommended: Next.js 16 (App Router, RSC) + Tailwind v4 + shadcn-style Base UI components + Supabase (self-hosted per infra existing) + Stripe + Expo RN mobile + Vercel/Docker. Rationale: gt7April already implements ~80% of this exact stack with verified protocol + tests, so consolidation cost is lowest. [inferred from explicit user directive "clean, unique, straightforward solution"; basis: existing codebase evidence]

## Users

- Primary: GT7 sim-racing drivers who want to improve lap times — they drive on PS5 with a wheel/pedals (or controller), want to see their telemetry, compare laps against their own best and friends, and pay for deeper analysis (sectors, fuel strategy, AI coaching).
- Secondary: competitive GT7 community (leaderboards, share links, ranks).
- Third: content creators sharing lap cards. [inferred; existing demo data + spec mention "race session" + therank "ranking" hint]

## Product Purpose

Capture GT7 telemetry (UDP 33739/33740, Salsa20) → store → analyze (lap comparison, sectors, racing line, fuel, tires, consistency) → coach the driver toward faster laps; monetize via subscription (Free/Pro/AI Premium). Success = a driver connects an iPhone/Android to the PS5, records a session in <2 min, and sees exactly where they lose time.

## Positioning

The only GT7 telemetry SaaS with a verified, tested capture pipeline (Salsa20 + packet parser validated against golden vectors), true multi-device mobile capture, self-hosted data ownership, and analysis depth (median-lap, time-diff-by-distance, ghost replay) — one clean product instead of six half-built forks.

## Operating Context

- Driver at the PS5: phone/tablet on the wheel deck capturing via local Wi-Fi UDP; then post-session, web dashboard on laptop/phone to analyze.
- Web dashboard must survive poor network (real-time streaming) and handle 60Hz telemetry (10Hz client downsampling, 300-frame batched uploads).
- Design context: racing aesthetics (telemetry HUD), but the dashboard is an Operate surface — scanability trumps drama.

## Capabilities and Constraints

Confirmed capabilities harvested from the 6 repos (see knowledge-db):
- capture: UDP listener :33740, heartbeat 'A' :33739, Salsa20/20, packet parse (proven offsets), on-track filter, lap detection, 10Hz downsample, batch upload.
- analysis: lap comparison (distance-normalized), sector split (needs completion), racing-line / corner analysis, fuel strategy, tire wear, consistency score, ghost replay, time-diff by distance.
- product: auth, tiers/quota, API keys, leaderboards, share links, data export CSV/JSON, AI coaching (OpenRouter), admin panel.
- constraints: GT7 UDP protocol is undocumented/version-fragile (.35-.29 magic trims [inferred]; do not invent); Convex has 1MB doc limits → batched telemetry storage; self-hosted Supabase infra exists (PG17, Kong, GoTrue, Realtime); no Android app built yet; no legal/ToS opinion on Sony/PD IP telemetry.

## Brand Commitments

[inferred from code evidence, not user-stated]
- Name across repos: "fclan" (26), "GTT" (26), "GT7 Telemetry Pro" (Pro), no final name confirmed. -> open decision: pick a single brand name. Keep violet-racing identity as the family (all three visual worlds share violet/purple + racing accents).

## Evidence on Hand

- Verified Salsa20 golden vectors + packet parse tests: gt7April `src/shared/gt7/gt7.test.ts`.
- 58-assertion E2E + realtime suites: gt7April `scripts/`.
- Stripe test mode IDs + STRIPE_SETUP.md: GT7-Telemetry-Pro (live TEST IDs confirmed).
- Design systems: Stitch glassmorphism (26, mock-ups + CSS), MD3 purple (Pro, full token theme), Tailwind v4 violet dark (April, coherent + applied).
- Analysis algorithms (Python/Bokeh): gt7dashboard-saas `gt7helper.py` — time-diff-by-distance, median lap, fuel map.
- No real device capture fixture exists yet (nothing recorded from actual PS5) — must be produced before ship [evidence absence].

## Product Principles

1. Verified before polished — protocol constants, parser offsets, and crypto must be gold-vector tested (the audit found a real Salsa20 bug in 26 and a stale wrong-feeling in Pro's upload enum).
2. One base, feature harvest — gt7April is the base; other repos contribute modules; never maintain parallel implementations.
3. Data first, mock never — every screen must read real data (the audit found demo theater in 4 of 4 implementations); demo mode is a labeled opt-in feature only.
4. Operate over decorate — the dashboard is a racing instrument; hierarchy, scanability and tabular mono numerals outrank effects; marketing surface (landing/pricing) can be Persuade mode but must not bleed cluttered patterns into the app.
5. Sell depth, not width — pricing tiers reflect real value (analysis vs AI coaching vs team); no features on marketing that don't exist.

## Accessibility & Inclusion

Racing data is dense — maintain WCAG-ish contrast for telemetry colors on dark bg (spec: use light/dark pairings from dashboard's gt7colors), respect prefers-reduced-motion (already honored in dashboard CSS), keyboard-navigable charts, ARIA labels for gauge/telemetry, high-contrast mode. [inferred; no explicit requirement]

---

## Open decisions (recorded, not invented)

- Single brand name (candidate: "Apex Laps" / "fclan" / "GT7 Telemetry"): UNRESOLVED — recommended "Apex Laps" (unique, not GPL-adjacent, ownable).
- Android app: Expo RN covers iOS+Android from gt7April codebase; no Android build made yet.
- Hosting: Vercel vs self-hosted Docker on Proxmox (gt7April infra exists); recommendation: self-hosted-first (user owns infra) with Vercel option for marketing.
- Payment currency/price points: keep Free/$9.99 Pro/$24.99 AI as evidence-based start; taxes/PIX vs card = region question (PT-BR audience, infra in BR network) — need A/B later.
