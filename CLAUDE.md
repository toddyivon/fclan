@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Next.js 16

This project uses **Next.js 16.2.3 with React 19**. APIs, conventions, and file structure differ from older Next versions in your training data. Before writing any Next-specific code (route handlers, layouts, middleware, config, caching), consult `node_modules/next/dist/docs/` and heed deprecation notices.

## Commands

```bash
npm run dev      # Next.js dev server (localhost:3000)
npm run build    # production build
npm run start    # run built app
npm run lint     # eslint (flat config: eslint.config.mjs)
```

No test runner is configured. Database migrations are raw SQL applied in the Supabase SQL editor (or via `scripts/apply-migration.mjs` / `scripts/run-migration.js`). Drizzle ORM is installed for typed queries but no `drizzle-kit` scripts are wired into `package.json`.

Environment setup is documented in `SETUP.md`. Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `STRIPE_*`, `OPENAI_API_KEY`.

## Architecture

This is a GT7 (Gran Turismo 7) telemetry SaaS. Full product spec lives in `specs/spec.md`; data model in `specs/data-model.md`; API contracts in `specs/api-contracts/`.

**Data flow:** PS4/PS5 emits UDP telemetry → React Native phone app in `mobile-app/` decrypts Salsa20 and forwards over HTTPS → `src/app/api/ingest/` writes to Supabase → web dashboard subscribes via Supabase Realtime.

**Two apps in one repo:**
- Web dashboard: root (Next.js App Router, Tailwind v4, shadcn-style UI in `src/components/ui/`).
- Mobile capture app: `mobile-app/` (Expo; requires `npx expo prebuild` due to native `react-native-udp`).

The shared telemetry packet shape lives in `src/lib/gt7/types.ts` and is the canonical contract between mobile and web.

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

**Deployment:** `Dockerfile` + `docker-compose.yml` + `deploy.sh` target a self-hosted server (see session history for 10.70.23.247 Proxmox LXC context). Not Vercel-first despite the Next stack.
