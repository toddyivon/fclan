# GT7 Telemetry SaaS — Unified Knowledge Database

Consolidation of 6 GitHub repos (cloned to `~/code/`) → one knowledge base.
Generated 2026-09-07.

---

## 0. Executive Summary

Two independent attempts at the same product exist on this machine:
**"GT7 Telemetry SaaS" (analysis + paid subscription, iPhone/Android, web)**.

- Spec source: `GT7_Data/README.md` (Nov 2024, integration-first plan).
- Ranking/community layer: `therank` (2023, one line — unstarted).
- 4 implementation repos, all early-stage, all with real working protocol code but
  stubbed/mocked product layers.

**Best candidates to consolidate:**
- `gt7April` — closest to shippable: verified Salsa20/packet parser, self-hosted
  Supabase, full API, E2E suites, Stripe wiring, working auth, real leaderboards.
- `gt7dashboard-saas` — deepest ANALYSIS algorithms (time-diff by distance,
  median-lap, fuel-map, speed variance) + genuine native iOS capture (SwiftUI),
  but its analysis engine lives in Python/Bokeh.
- `GT7-Telemetry-Pro` — widest FEATURE breadth (social, achievements, rankings
  engine, MD3 design), but data layer is mocks/in-memory everywhere.
- `gt7Telemetry26` — best Convex mobile capture design; dashboard is demo theater,
  auth absent, Salsa20 implementation has a verified crypto bug.

### Cross-repo verdict per spec component (GT7_Data README)

| Spec component | Best implementation repo | State |
|---|---|---|
| Data collection (UDP/Salsa20 capture) | gt7April (verified, tested) / gt7dashboard-saas (Swift port) | ✔ usable |
| Analysis & visualization | gt7dashboard-saas (deep) / gt7April (sector, lap-cmp, ghost) | ✔ usable |
| Backend & API + DB | gt7April (Supabase+RLS, E2E tested) | ✔ usable |
| Web interface | gt7April (Next+Tailwind v4, RSC) / GT7-Telemetry-Pro (MD3) | ✔ visual, data stubbed in Pro |
| Mobile app (iPhone/Android) | gt7April (Expo RN) / gt7dashboard-saas (native SwiftUI) | ✔ capture real, upload gap |
| Subscription/SaaS | gt7April (full Stripe+quota) | ✔ mostly wired |
| Data export | gt7April (CSV/JSON, Pro-gated) | ✔ |
| Rankings/competition (therank) | GT7-Telemetry-Pro (rankings engine) / gt7April (leaderboard) | ◐ partial |

---

## 1. Per-Repo Deep Reports

### 1.1 GT7_Data (spec only — README.md, 1 file)

- **What it is:** the product spec. Subscription SaaS for GT7 telemetry analysis.
- **Objective:** collect telemetry → analyze laps → sell as subscription; iPhone+Android.
- **Core features promised:** track performance per session; lap-vs-track layout
  comparison; cornering/optimal racing line evaluation.
- **Components:** Data Collection (PS5 live + file import + mobile upload apps),
  Analysis & Visualization (inherit gt7dashboard features), Backend & API
  (DB schema, ingest API, serve web, export), Web Interface (Next.js preferred).
- **Tech prefs:** React Native/Flutter; Node/Express or Python/Django|Flask;
  PostgreSQL/MongoDB; Python/NumPy/Pandas; D3/Chart.js; Next.js.
- **Integration targets:** snipem/gt7dashboard, BluesJiang/gran-turismo-telemetry-app,
  NenKai tools.
- **Gaps in spec itself:** no pricing tiers, billing, security, ops, compliance,
  retention, milestones. Mislabel: GT7 exposes UDP Simulator Interface, not "NenKai's API".

### 1.2 therank (1 line — unstarted)

- "Virtual Racing Ranking - GT7". Sep 2023. No code.
- Imposes growth/competition layer on top of the analysis spec (opposed privacy axes:
  public ranked profiles vs private session analysis). Unscoped: standalone product or feature.

### 1.3 GT7-Telemetry-Pro (213 files — flagship, public, most recent)

- **Stack:** Next.js 14 App Router + React 18, MUI v5 (custom MD3 theme, purple #6200ea),
  Convex 1.5 backend (22 tables), Zustand + TanStack Query, Stripe v14, Turborepo,
  Expo 49 mobile, Vercel deployment. 40+ web deps, 22 mobile deps.
- **Features:** auth (JWT/bcrypt), demo mode, dashboard, sessions, analysis hub
  (6 engines: cornerDetector, racingLineCalculator, lapComparisonEngine, tireAnalyzer,
  fuelCalculator — REAL, pure, tested nowhere), leaderboards, social (follows/likes/
  comments/notifications/achievements), subscription, settings.
- **Data model:** 22 Convex tables — users (roles, subscription), sessions, laps,
  telemetryPoints, analysisResults, social tables, leaderboards, rankings
  (bronze→diamond), achievements, subscriptions/invoices/usage.
- **Critical state (verified):**
  - Stripe webhook → in-memory `Map`, Convex call commented out ("In production...") —
    subscriptions lost on redeploy.
  - `/api/stripe/verify-session` missing (success page 404s); `/api/sessions` + telemetry
    POST missing (mobile upload fails); socialStore all actions stubbed.
  - All TanStack hooks arg-mismatch Convex signatures → every page renders inline mocks.
  - Analysis engines never invoked by any page; racing-line + laps API return mock data.
  - Convex surface unrestrained: `getUserByEmail` returns `passwordHash` (public!),
    `updateUser` accepts caller-controlled `role` (self-grant admin/premium),
    `deleteUserById`/`deleteSession` unguarded, `checkAchievements`/ranking mutations open.
  - login accepts plaintext `'master'`/`'Master123!'`; any `demo_token_*` cookie = authed premium.
  - Hardcoded JWT fallback secret; `next.config.js` has `ignoreBuildErrors: true`.
- **Design:** MD3 full token theme (MuiString overrides, light/dark toggle), framer-motion.
  5 pages use Tailwind-ish utility classes from globals.css with no Tailwind config (split personality).
- **Worth keeping:** MD3 design system, analysis engine suite (pure, port-tested shapes),
  rankings/points/achievements domain, mobile Salsa20 (correct!) + lap detection service.
- **Verdict:** widest feature surface, thinnest real wiring. Revive as features, not as base.

### 1.4 gt7Telemetry26 (108 files — "fclan", Convex + Expo)

- **Stack:** Next.js 16.1.6, React 19, Tailwind v4 CSS-first, Convex 1.31.7 (7 tables),
  Chart.js, framer-motion (unused), lucide, Stripe 20 (half-wired), Expo 54 mobile.
- **Features:** landing/pricing/dashboard/rankings/profile pages; mobile app with UDP
  capture (App.tsx 429 lines) + cloud sync; track notes CRUD; demo seed data.
- **Data model:** users, subscriptions, sessions, laps, telemetryFrames (JSON-string
  batched 300), aiReports, trackNotes on Convex.
- **Critical state (verified):**
  - Salsa20 bug: `state[8]/state[9]` incremented twice per block, wrong words for
    32-byte-key construction → only first 64 bytes decrypt; rest garbage.
  - `mobile/package.json` main = `expo-router/entry` → the default Expo template boots,
    real client never mounts.
  - Auth: `@auth/core` zero imports; login = setTimeout fake; zero route protection.
  - Stripe webhook: 4 events all `console.log` + TODO.
  - Dashboard: `generateDemoTelemetry(8)`, hardcoded "Alex Rossi" etc. — 0% real data.
  - globals.css: `btn-primary`, `glass-card-animated`, `chart-container`, `bg-primary`
    used but undefined → broken styling.
  - 6 Convex queries have zero callers; RaceLineChart unreachable.
- **Design:** "Stitch" glassmorphism — purple #7311d4, bg #191022, magenta accents,
  glass cards + neon glow. Portfolio-level visuals; i18n EN/PT/ES.
- **Worth keeping:** batch-upload protocol idea (300-frame JSON chunks), track-notes
  UX concept, Stitch language as a skin option, i18n.
- **Verdict:** design-first prototype. Not a runtime base.

### 1.5 gt7dashboard-saas (94 files — Bokeh + FastAPI + Supabase + SwiftUI)

- **Stack:** Python 3.9+ (Bokeh 3.6 dashboard, FastAPI 0.115 SaaS layer, pandas
  for time-diff, scipy find_peaks, pycryptodome Salsa20), Supabase (PG17 + auth +
  storage), Jinja2 templates, no Node. iOS: SwiftUI + Network.framework +
  CryptoSwift (XcodeGen). GPL-3.0.
- **Features:** Bokeh dashboard 3 tabs (Get Faster / Race Lines / Race): time-diff
  graphs, speed/distance, variance, peaks/valleys, throttle/yaw/MRP/braking/coasting/
  gear/RPM/boost/tires charts, race time table w/ overlay, fuel map sim, tuning info,
  race-line 3×3 grid. FastAPI SaaS: login/upload/download/delete sessions, PS configs.
  iOS GT7Capture: capture tab, sessions tabs, settings.
- **iOS Protocol layer (VERIFIED REAL):** NWListener UDP :33740, heartbeat 'A' :33739
  every 100 pkts/10s, Salsa20 key = `"Simulator Interface Packet GT7 ver 0.0"[:32]`,
  IV `[seed^0xDEADBEAF, seed]` LE, magic 0x47375330, full offset map, lap assembler.
- **Critical state (verified):**
  - ViewModels fake: AuthViewModel mock_token, CaptureViewModel never starts
    TelemetryService (TODO comment), SessionListViewModel all TODO, SupabaseManager
    never used by any VM.
  - `/bokeh` iframe route missing in server.py (dashboard.html loads it → 404 cloud).
  - iOS upload `source="ios_app"` vs DB CHECK `'web_upload','iphone_app'` → INSERT fails.
  - tier column exists, zero upgrade path; no Stripe anywhere.
  - `gt7colors.py` + 750-line design system CSS written but not imported by Bokeh UI.
  - RR slip uses FR data deliberately (file-format compat).
- **Worth keeping (THE ANALYSIS GOLD):** time-diff-by-distance via pandas resample/
  interpolate (gt7helper 62–109), median-lap synthesis, speed-variance consistency,
  fuel-map mixture simulator, yaw-rate/60-tick MRP, race-line NaN-split zones,
  Swift protocol/LapAssembler port.
- **Verdict:** analysis engine + protocol source of truth; product layer fake.

### 1.6 gt7April (187 files — "the one", Next + Supabase + Expo, self-hosted)

- **Stack:** Next.js 16.2.3 (App Router, standalone), React 19.2.4, Tailwind v4 CSS-first
  + Base UI shadcn-style, Recharts, framer-motion, zod v4. Backend: self-hosted
  Supabase (PG17, Kong, GoTrue, Realtime, Studio via infra/supabase compose) +
  7 SQL migrations + RLS + pg_cron. Payments: Stripe 22 (Checkout, Portal, webhooks).
  AI: Vercel AI SDK + OpenRouter (gpt-4o-mini). Mobile: Expo 53, react-native-udp,
  expo-secure-store, expo-speech. Deploy: multi-stage Docker + rsync to Proxmox LXC
  (10.70.23.247), GitHub Actions CI (lint/tsc/vitest/build). E2E: 58-assertion endpoint
  suite + realtime suite + mock OpenRouter. 12 commits, actively iterated.
- **Features:** landing + 3-tier pricing (Free/Pro 9.99/AI 24.99), auth (Supabase email
  + password, forgot/reset), dashboard (stats, LIVE telemetry widget, leaderboard
  widget), sessions (paginated, filters, detail w/ telemetry charts, track map SVG
  color-by-speed, lap comparison resampled 0-100%, ghost replay 1/2/4x, fuel strategy,
  consistency score, export CSV/JSON), AI analysis (streaming coach + history + quota),
  leaderboards, daily races hub (fetches ddm999/gt7info), settings (profile, billing,
  API keys `gt7_` hashed), ADMIN panel (users, tiers, roles), share tokens (public lanes),
  API keys + rate limits + quotas. Mobile: capture pipeline (single zustand store,
  serialized flush, backoff, final-flush retries, voice announcer).
- **Protocol (VERIFIED for real):** `src/shared/gt7/salsa20.ts` + `packet.ts` canonical
  module, validated against pycryptodome golden vectors + PDTools/gt7dashboard offsets;
  heartbeat 'A' :33739, listen :33740; magic `0x47375330`; key/nonce correct.
- **Data model:** users, api_keys (SHA-256), telemetry_sessions, telemetry_points
  (Realtime published), lap_data, ai_analyses, stripe_subscriptions, rate_limits,
  stripe_webhook_events, user_quotas, shared_laps, leaderboard_entries +
  leaderboard_public view. 12 RPCs (consume_rate_limit, consume_ai_quota, refund,
  create_api_key TOCTOU-safe, purge_free_tier_sessions...).
- **Verified-good:** Stripe webhook idempotency + recency + tier recompute; ingest
  idempotency `(session_id, packet_id)`; auth route protection; RLS sanity;
  leaderboard ranking; open-redirect guard.
- **Gaps (remaining):** sector analysis only labels thirds (no real sector split);
  tuning insights (max speed/min ride height) never ported; Drizzle mirror schema
  drifts (SQL is source of truth); Daily Races upstream dead (honest fallback);
  mobile ingest URL defaults to a live domain (production bleed — dev concern);
  no down-migrations/rollback; CLAUDE.md says lib/ai exists (it doesn't).
- **Design:** violet oklch(0.48 0.26 289.3) primary, dark-first, shadcn-style
  "base-nova" components on Base UI, racing HUD feel, tabular-nums mono displays,
  glow/hero radial. Cohesive, consistent, modern.
- **Verdict: RECOMMENDED BASE.** Only repo with verified protocol + real auth +
  real payments wiring + real DB + real tests. The consolidation should be
  **gt7April as the base + feature imports from the other three.**

---

## 2. Code Review — Two-Axis Aggregate

### Axis A: Standards (Fowler baseline — 6 repos)

Hard violations (chain-reaction severity):
1. **GT7-Telemetry-Pro `middleware.ts:66`** — `demo_token_*` cookie = authed user, user fabricated; `hasPermission` default `return true`. Auth bypass.
2. **GT7-Telemetry-Pro `lib/jwt.ts:4`** — hardcoded fallback JWT secret signs/verifies silently.
3. **GT7-Telemetry-Pro api/telemetry/laps + racing-line** — real route protection, mock data always.
4. **gt7Telemetry26 `salsa20.ts`** — wrong-state counter increment (double inc, wrong words) → stream decrypts past first 64 bytes.
5. **gt7Telemetry26 mobile entry** — `expo-router/entry` boots template, real client (App.tsx) never mounts.
6. **gt7Telemetry26 globals.css** — classes used ×60+ undefined → broken visuals.
7. **gt7April env.ts bypass** — 5 route handlers use raw `process.env` + `!` (keys, share, admin/*, webhooks) despite Zod env accessor.
8. **gt7dashboard-saas `/bokeh`** — iframe route not served.
9. **gt7dashboard-saas SWIFT source enum** — `"ios_app"` vs CHECK `'web_upload','iphone_app'` → every upload fails.
10. **gt7dashboard-saas ViewModels** — all simulated; real TelemetryService never invoked.

Judgement-call smells (annotated counts):
- Duplicated Code: **12+** — `formatLapTime` ×5 (Pro); admin-client ×7 (April); mobile/frames/stats ×3 (26); schema.sql == migration (dashboard); safe-user destructure ×6 (Pro).
- Primitive Obsession: plan/tier/source strings redeclared across layers (all repos).
- Speculative Generality: social/achievements/leaderboard cache tables unwritten (Pro); timeTrials stub, 6 dead queries (26); bokeh_app.py dead (dashboard); `setCapturing` back-compat (April).
- Middle Man: convex-client.ts 2-line re-exports (Pro); lib/gt7/types.ts shim (April).
- Data Clumps: stats shape declared ×5 (Pro); columns mapped ×3 (April).
- Shotgun Surgery: tier additions touch 4 layers (April); plan additions touch schema/stores (Pro).
- Mysterious Name: `sp`, `getActiveTracks` (scans sessions), `bokeh_app.py`.
- No Feature Envy / Message Chains / Refused Bequest / Repeated Switches of note.
- gt7April: the only repo with documented standards (CLAUDE.md) that were mostly followed; 2 hard + 8 judgement violations.

### Axis B: Spec (GT7_Data README)

Missing/partial across all repos:
- Sector analysis (third-labeling only) — gt7April; dashboard has none either.
- Tuning insights (max speed / min ride height) — missing everywhere.
- File import of recorded telemetry (spec §1) — missing everywhere.
- Android app — only iOS exists (dashboard) or Expo RN cross-platform (April, untested).
- Export — gt7April ✓; Pro/dashboard/26 ✗.

Scope creep vs spec: social/achievements (Pro), AI coaching + ghost replay + share + admin + daily races + trials (April), "fclan" branding + AI copy (26).

Implemented-but-wrong (5 repos):
- Pro: webhook→Map; hook arg mismatch; engines never wired; mobile upload 404. (Worst spec compliance—~70% surface mock.)
- 26: Salsa20 bug; dashboard 0% real; auth absent; webhook TODO; mobile unmounted. (Hardest failures.)
- dashboard: VM fakes; /bokeh 404; upload enum; no tier path. (Protocol right, product fake.)
- April: best compliance; remaining = sector analysis/tuning gaps + rollback infra drift.
- therank: no implementation.

**Axis totals:** Standards ~32 findings (13 hard, 19 judgement) · Spec ~28 findings (9 hard). Worst per axis: Standards → auth bypass chain in GT7-Telemetry-Pro; Spec → gt7Telemetry26 Salsa20 + 0% real data.

---

## 3. Security Smoke Flags (consolidated, for dedicated pass)

1. Pro Convex public queries leak passwordHash; unguarded delete/update; self-grant role; open ranking mutations.
2. Pro plaintext demo passwords; demo_token auth bypass; JWT fallback secret; no CSRF; deploy_helper AutoAddPolicy + SSH password.
3. 26: no auth routing; Stripe key fallbacks `sk_test_placeholder`; mobile hardcodes Convex URL.
4. Dashboard: no billing; JWT local verify optional fallback; service-role in user-scoped paths; storage bucket policies commented out in schema.sql.
5. April: strong (RLS, hashed keys, Zod, rate limits) — only env.ts bypass + raw secrets in admin routes; mobile default ingest URL prod-bleed.

---

## 4. What Each Repo Uniquely Owns (reuse map)

| Asset | Repo | Effort to lift |
|---|---|---|
| Verified Salsa20/20 + packet parser (JS, tested) | gt7April | 0 — take as-is |
| Time-diff-by-distance + median-lap + fuel-map | gt7dashboard-saas | port Python→TS |
| Analysis engine suite (corners, racing line, tire, fuel, lap cmp) | GT7-Telemetry-Pro | 0 — pure TS, unwire |
| Rankings/achievements/points domain | GT7-Telemetry-Pro | moderate |
| Native SwiftUI iOS capture (protocol + lap assembler) | gt7dashboard-saas | moderate (combine w/ Expo RN decision) |
| Batch telemetry upload (300-frame JSON chunks) | gt7Telemetry26 | low |
| Track-notes + i18n EN/PT/ES + Stitch skin | gt7Telemetry26 | low-moderate |
| Base UI shadcn-style component layer + RSC app wiring | gt7April | 0 — take as-is |
| Supabase self-hosted infra stack | gt7April | 0 — take as-is |
| Ghost replay + daily races + share links | gt7April | 0 — take as-is |
| 58-assert E2E + realtime + CI | gt7April | 0 — take as-is |
