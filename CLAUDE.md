@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Next.js 16

This project uses **Next.js 16.2.3 with React 19**. APIs, conventions, and file structure differ from older Next versions in your training data. Before writing any Next-specific code (route handlers, layouts, middleware, config, caching), consult `node_modules/next/dist/docs/` and heed deprecation notices.

## Commands

```bash
npm run dev             # Next.js dev server (localhost:3000)
npm run build           # production build
npm run start           # run built app
npm run lint            # eslint (flat config: eslint.config.mjs)
npm run typecheck       # tsc --noEmit
npm test                # vitest (unit: gt7 crypto/parser, laps, gates)
npm run test:endpoints  # E2E API suite vs running app + local Supabase (scripts/test-endpoints.mjs)
npm run test:realtime   # live-telemetry websocket pipeline test
npm run mock:ai         # OpenAI-compatible SSE mock on :4545 for offline AI-route testing
```

**Database backend:** SELF-HOSTED Supabase in `infra/supabase/` (official docker stack, PG17, Kong on **:8100**, Studio same URL, Postgres via Supavisor on :5432 user `postgres.gt7local`). `docker compose up -d && ./apply-migrations.sh` from that dir; secrets live in its gitignored `.env`. `.env.local` and `.env.production.local` point at it (old cloud config: `.env.local.cloud.bak`). The CLI dev stack (`supabase start`, :54321) still works but is stopped/redundant. Demo data: `scripts/seed-demo.mjs`. `.env.production.local` (gitignored) points the app at the local stack with dummy Stripe/OpenRouter values; build + `PORT=3002 npm run start`, then run the test scripts. Stripe checkout happy path uses stripe-mock (`docker run -d -p 12111:12111 stripe/stripe-mock` + `STRIPE_API_HOST=localhost:12111`). Webhook tests HMAC-sign synthetic events with the local `STRIPE_WEBHOOK_SECRET`.

Mobile (`cd mobile-app`): `npm install --legacy-peer-deps` (peer conflicts with react-native-udp). Native build via `npx expo prebuild --platform ios`. Cloud builds via `eas build -p ios --profile preview` → TestFlight. Local `expo run:ios --device` requires Xcode version matching the iPhone's iOS (currently Xcode 26.0.1 can't target iOS 26.3+ devices).

Database migrations are raw SQL in `supabase/migrations/`; apply with `supabase db push`. The legacy `scripts/run-migration.js` and `scripts/apply-migration.mjs` were removed (had hardcoded credentials). Drizzle ORM is installed but no drizzle-kit scripts are wired in.

Environment setup is documented in `SETUP.md`. Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `STRIPE_*`, `OPENAI_API_KEY`.

## Architecture

This is a GT7 (Gran Turismo 7) telemetry SaaS. Full product spec lives in `specs/spec.md`; data model in `specs/data-model.md`; API contracts in `specs/api-contracts/`.

**Data flow:** PS4/PS5 emits UDP telemetry → React Native phone app in `mobile-app/` decrypts Salsa20 and forwards over HTTPS → `src/app/api/ingest/` writes to Supabase → web dashboard subscribes via Supabase Realtime.

**Two apps in one repo:**
- Web dashboard: root (Next.js App Router, Tailwind v4, shadcn-style UI in `src/components/ui/`).
- Mobile capture app: `mobile-app/` (Expo SDK 53, React Native 0.79, Expo Router). Native build required due to `react-native-udp` — Expo Go does NOT work. Bundle id `com.toddyone.gt7telemetry`. EAS project id lives in `mobile-app/app.json` `extra.eas.projectId`. New native modules (expo-keep-awake, expo-speech) and the iOS `NSLocalNetworkUsageDescription` require a fresh prebuild/EAS build to land on device.

The canonical telemetry types live in `src/shared/telemetry.ts` (`TelemetryPacket`, `IngestPoint` wire format, flags, `formatLapTime`); the binary protocol lives in `src/shared/gt7/` (`salsa20.ts` — verified against pycryptodome golden vectors; `packet.ts` — decryption + parser with offsets verified against PDTools/gt7dashboard; tested in `gt7.test.ts`). Mobile carries byte-for-byte copies at `mobile-app/src/gt7/{salsa20,packet,telemetry}.ts` — keep them in sync. Heartbeat `'A'` (296-byte packet) is used for max GT7-version compatibility.

**Route groups (`src/app/`):**
- `(marketing)` — public landing.
- `(dashboard)` — authed app: `dashboard/`, `sessions/`, `analysis/`, `settings/`, `admin/`. Shares `layout.tsx`.
- `login/`, `signup/`, `auth/` — Supabase auth flows.
- `api/ingest/` — telemetry write endpoint (excluded from auth middleware).
- `api/webhooks/` — Stripe webhooks (excluded from auth middleware).
- `api/ai/` — OpenAI / OpenRouter lap-analysis endpoints (Vercel AI SDK).

**Auth:** `middleware.ts` uses `@supabase/ssr` to gate `/dashboard`, `/sessions`, `/analysis`, `/settings`, `/admin`, and redirect authed users away from `/login`, `/signup`. `api/ingest` and `api/webhooks` are explicitly excluded from the matcher so raw device posts and Stripe can reach them without a session. RLS in Supabase enforces per-user data scoping — don't rely on middleware alone.

**Supporting libs (`src/lib/`):** `supabase/` (browser + server clients), `auth/`, `ai/` (Vercel AI SDK providers), `gt7/` (telemetry types + decoding helpers), `utils.ts` (shadcn `cn`).

**Billing:** Stripe with two price IDs (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_AI_PREMIUM`). Tier gating (Free / Pro / AI Premium) governs session-history retention, AI analysis quotas, and API-key limits — see `specs/spec.md` before adding gated features.

**Deployment:** `Dockerfile` + `docker-compose.yml` + `deploy.sh` target a self-hosted server (Proxmox LXC at 10.70.23.247, user `missola`). LXC restricts sysctl writes — container compose must use `network_mode: host` + `security_opt: apparmor:unconfined` to start. Local dev runs the same image on port 3001 since port 3000 is usually occupied. Not Vercel-first despite the Next stack.

**Key internal modules:**
- `src/env.ts` — Zod-validated env vars (server + client split).
- `src/lib/auth/safe-redirect.ts` — validates `redirectedFrom` against `ALLOWED_PREFIXES` to block open-redirect.
- `src/lib/billing/quota.ts` — `getQuota`; `consumeAiAnalysis`/`refundAiAnalysis` call the atomic `consume_ai_quota`/`refund_ai_quota` RPCs (service-role only).
- `src/lib/billing/gate.ts` — `FEATURES` map per tier, `checkFeature`/`tierHasFeature`; all tier gating goes through this.
- `src/lib/billing/stripe.ts` — single Stripe client constructor (`STRIPE_API_HOST` redirects to stripe-mock in tests).
- `src/lib/gt7/laps.ts` — pure lap-transition detection used by ingest (tested in `laps.test.ts`).
- Migrations: `002` (role, cascades, indexes, `rate_limits`+`consume_rate_limit`, webhook idempotency, `user_quotas`+tier-sync trigger, `purge_free_tier_sessions`), `003` (auth.users → public.users mirror trigger), `004` (RLS on `users` + column-level UPDATE grant (name only), FK to auth.users, atomic quota RPCs, lap columns, unique lap_data index), `005` (subscription status CHECK, unique telemetry point index for idempotency, ai_analyses user_id/model/text, `shared_laps`, `leaderboard_entries`+`leaderboard_public` view, pg_cron purge schedule), `006` (Realtime publication for telemetry tables, function grants locked to service_role, `refund_ai_quota`). Apply with `supabase db push` (cloud) or `supabase migration up` (local).

**Gotchas:**
- `(dashboard)/layout.tsx` is a server component (uses server Supabase client + `redirect`). Do NOT import `framer-motion` there — it breaks SSR with digest `1823605700`. Put motion inside client child components instead.
- Middleware cookie `setAll` must propagate cookies to BOTH `request.cookies` AND a fresh `NextResponse.next({ request })` with `options`, otherwise Supabase session doesn't persist after login.
