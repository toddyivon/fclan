@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Next.js 16

This project uses **Next.js 16.2.3 with React 19**. APIs, conventions, and file structure differ from older Next versions in your training data. Before writing any Next-specific code (route handlers, layouts, middleware, config, caching), consult `node_modules/next/dist/docs/` and heed deprecation notices.

## Commands

```bash
npm run dev        # Next.js dev server (localhost:3000)
npm run build      # production build
npm run start      # run built app
npm run lint       # eslint (flat config: eslint.config.mjs)
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

Mobile (`cd mobile-app`): `npm install --legacy-peer-deps` (peer conflicts with react-native-udp). Native build via `npx expo prebuild --platform ios`. Cloud builds via `eas build -p ios --profile preview` → TestFlight. Local `expo run:ios --device` requires Xcode version matching the iPhone's iOS (currently Xcode 26.0.1 can't target iOS 26.3+ devices).

Database migrations are raw SQL in `supabase/migrations/`; apply with `supabase db push`. The legacy `scripts/run-migration.js` and `scripts/apply-migration.mjs` were removed (had hardcoded credentials). Drizzle ORM is installed but no drizzle-kit scripts are wired in.

Environment setup is documented in `SETUP.md`. Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `STRIPE_*`, `OPENAI_API_KEY`.

## Architecture

This is a GT7 (Gran Turismo 7) telemetry SaaS. Full product spec lives in `specs/spec.md`; data model in `specs/data-model.md`; API contracts in `specs/api-contracts/`.

**Data flow:** PS4/PS5 emits UDP telemetry → React Native phone app in `mobile-app/` decrypts Salsa20 and forwards over HTTPS → `src/app/api/ingest/` writes to Supabase → web dashboard subscribes via Supabase Realtime.

**Two apps in one repo:**
- Web dashboard: root (Next.js App Router, Tailwind v4, shadcn-style UI in `src/components/ui/`).
- Mobile capture app: `mobile-app/` (Expo SDK 53, React Native 0.79, Expo Router). Native build required due to `react-native-udp` — Expo Go does NOT work. Bundle id `com.gt7telemetry.app`. EAS project id lives in `mobile-app/app.json` `extra.eas.projectId`.

The canonical telemetry packet shape lives in `src/shared/telemetry.ts` (imported by web via `src/lib/gt7/types.ts` re-export). Mobile duplicates the shape in `mobile-app/src/gt7/parser.ts` — keep them in sync.

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

**Key internal modules added in recent refactor:**
- `src/env.ts` — Zod-validated env vars (server + client split).
- `src/lib/auth/safe-redirect.ts` — validates `redirectedFrom` against `ALLOWED_PREFIXES` to block open-redirect.
- `src/lib/billing/quota.ts` — `getQuota`, `consumeAiAnalysis` (monthly reset); reads `user_quotas` table.
- `supabase/migrations/002_improvements.sql` — adds `role` to users, ON DELETE CASCADE on FKs, hot-path indexes, `rate_limits` + `consume_rate_limit()` RPC, `stripe_webhook_events` idempotency table, `user_quotas` + `sync_user_quota_tier` trigger, `purge_free_tier_sessions()` cron fn. Must be applied via `supabase db push`.

**Gotchas:**
- `(dashboard)/layout.tsx` is a server component (uses server Supabase client + `redirect`). Do NOT import `framer-motion` there — it breaks SSR with digest `1823605700`. Put motion inside client child components instead.
- Middleware cookie `setAll` must propagate cookies to BOTH `request.cookies` AND a fresh `NextResponse.next({ request })` with `options`, otherwise Supabase session doesn't persist after login.
