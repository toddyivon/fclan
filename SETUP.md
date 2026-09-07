# GT7 Telemetry SaaS — Setup Guide

Everything needed to run the web app, the mobile capture app, and the full local test stack. Commands were verified against the files in this repo.

## 1. Prerequisites

| Tool | Why | Notes |
|---|---|---|
| Node.js 20.9+ (22 LTS recommended) | web app | the Docker image uses `node:22-alpine` |
| npm | package manager | lockfiles are `package-lock.json` |
| Docker | local Supabase stack, stripe-mock, production image | |
| [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | migrations + local stack | `npm i -g supabase` or `brew install supabase/tap/supabase` |
| Stripe account | billing | test mode is fine |
| OpenRouter account | AI lap analysis | https://openrouter.ai |
| Xcode + an Apple device, or an [EAS](https://expo.dev/eas) account | mobile app | native build required; Expo Go does **not** work |

## 2. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

All variables are validated at boot by `src/env.ts` (Zod). `NEXT_PUBLIC_*` values ship to the browser — only ever put the anon/publishable keys there.

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase dashboard → Project Settings → API (`https://<ref>.supabase.co`); local: `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | same page (anon / publishable key); local: printed by `supabase status` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (server only — never expose) | same page (service role / secret key); local: `supabase status` |
| `DATABASE_URL` | optional | Supabase → Project Settings → Database. **Use the session pooler URL** (`aws-0-<region>.pooler.supabase.com:6543`) — see [Troubleshooting](#10-troubleshooting) |
| `STRIPE_SECRET_KEY` | for billing | Stripe dashboard → Developers → API keys (`sk_test_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | for billing | same page (`pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | for billing | created with the webhook endpoint (`whsec_...`), see [§4](#4-stripe) |
| `STRIPE_PRICE_PRO` | for billing | price ID of the Pro monthly price (`price_...`) |
| `STRIPE_PRICE_AI_PREMIUM` | for billing | price ID of the AI Premium monthly price |
| `STRIPE_PRICE_PRO_ANNUAL` | optional | annual Pro price — when set, checkout offers yearly billing |
| `STRIPE_PRICE_AI_PREMIUM_ANNUAL` | optional | annual AI Premium price |
| `OPENROUTER_API_KEY` | for AI analysis | https://openrouter.ai/keys — used by `/api/ai/analyze` (model `openai/gpt-4o-mini`) |
| `OPENAI_API_KEY` | optional | https://platform.openai.com |
| `OPENROUTER_BASE_URL` | optional | point at the local mock for offline AI testing: `http://127.0.0.1:4545/api/v1` |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | yes | the app's public URL (`http://localhost:3000` in dev) — used for Stripe redirect URLs and share links |
| `SENTRY_DSN` | optional | error reporting |

## 3. Supabase

Migrations are plain SQL in `supabase/migrations/001_initial.sql` … `006_realtime_and_grants.sql` and must be applied **in order** with the Supabase CLI (do not paste them ad hoc — later migrations depend on earlier ones).

### Option A — Cloud project

```bash
# 1. Create a project at https://supabase.com (note your project ref)
supabase login
supabase link --project-ref <your-project-ref>

# 2. Apply all migrations
supabase db push
```

Copy the URL, anon key, and service role key into `.env.local`.

Optional — regenerate typed schema after schema changes:

```bash
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

### Option B — Local stack (used by the test suites)

```bash
supabase start          # Docker stack: API :54321, Postgres :54322, Studio :54323
supabase migration up   # apply 001–006 to the local database
supabase status         # prints the local URL, anon key, and service role key
```

The local Postgres is reachable directly at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

> Free-tier cloud projects **pause after ~1 week of inactivity**. If every request suddenly fails, unpause the project in the Supabase dashboard.

## 4. Stripe

1. In the Stripe dashboard (test mode), create two products:
   - **Pro** — recurring monthly price of **$9.99**
   - **AI Premium** — recurring monthly price of **$24.99**
   - Optionally add annual prices to each product (enables yearly billing in checkout).
2. Copy the price IDs into `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AI_PREMIUM` (and the `_ANNUAL` variants if created).
3. Copy the API keys into `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
4. Add a webhook endpoint pointing at `https://<your-domain>/api/webhooks/stripe` listening to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. For local development, use the Stripe CLI instead: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (it prints a `whsec_...` to use).

Webhook processing is idempotent (`stripe_webhook_events` table) and new subscribers automatically get a 7-day trial on their first subscription.

## 5. OpenRouter (AI analysis)

Create a key at https://openrouter.ai/keys and set `OPENROUTER_API_KEY`. Analyses stream via the Vercel AI SDK using `openai/gpt-4o-mini`. Quotas (50/month on Pro, unlimited on AI Premium) are enforced server-side in `src/lib/billing/quota.ts`.

For offline development you can run a canned OpenAI-compatible mock:

```bash
npm run mock:ai                                    # listens on :4545
# then set in your env:
OPENROUTER_BASE_URL=http://127.0.0.1:4545/api/v1
```

## 6. Run the web app

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`, `npm test`.

Sign up at `/signup`, then create an API key under **Settings → API Keys** — you'll need it for the mobile app. The raw key (`gt7_...`) is shown only once; only its SHA-256 hash is stored.

## 7. Mobile app (telemetry capture)

The app listens for GT7's encrypted UDP stream, decrypts it on-device, and POSTs batches to `/api/ingest`. It uses `react-native-udp`, a native module — **Expo Go cannot run it**; you must produce a native build.

### Install

```bash
cd mobile-app
npm install --legacy-peer-deps   # react-native-udp has peer-dependency conflicts
```

### Build — local device (iOS)

```bash
npx expo prebuild --platform ios   # generates/refreshes the native project
npx expo run:ios --device          # build + install on a plugged-in iPhone
```

> Local builds require an Xcode version that can target your iPhone's iOS version. If Xcode refuses the device, use the EAS cloud build below.

### Build — EAS cloud (TestFlight)

```bash
eas build -p ios --profile preview   # profiles defined in mobile-app/eas.json
```

The EAS project ID lives in `mobile-app/app.json` (`extra.eas.projectId`); bundle identifier is `com.toddyone.gt7telemetry`. Android: `npx expo run:android` or `eas build -p android`.

### Configure the app (Settings tab)

| Field | Value |
|---|---|
| API Key | the `gt7_...` key created in the web dashboard (Settings → API Keys) |
| Server URL | your deployed app URL, e.g. `https://your-domain.com` — or `http://<your-computers-LAN-IP>:3000` against a dev server |
| PS5 IP Address | PS5 → Settings → Network → Connection Status |
| Voice announcements | optional lap-time speech via `expo-speech` |

Settings persist in the device keychain (`expo-secure-store`).

### PlayStation requirements

- GT7 running with its **Simulator Interface** active — the app sends a heartbeat (`'A'`) to UDP **33739** on the console every 10 s and receives 296-byte packets at 60 Hz on UDP **33740**.
- Phone and console on the **same network**, with no AP/client isolation blocking UDP between them.
- iOS prompts for **Local Network** permission on first capture — accept it (the usage description is configured in `app.json`).

Start a session in GT7, open the **Capture** tab, and hit start; the web dashboard picks the session up live via Supabase Realtime.

## 8. Running the full local test suite

The E2E suites run against a real production build talking to the local Supabase stack — no cloud accounts needed.

```bash
# 1. Local Supabase
supabase start
supabase migration up

# 2. Environment for the production build
#    Create .env.production.local pointing at the local stack (next build/start
#    load it automatically). Use the keys printed by `supabase status`:
#      NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#      NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
#      SUPABASE_SERVICE_ROLE_KEY=<local service role key>
#      APP_URL=http://localhost:3002
#      NEXT_PUBLIC_APP_URL=http://localhost:3002
#      STRIPE_SECRET_KEY=sk_test_local_offline_dummy
#      STRIPE_WEBHOOK_SECRET=whsec_local_test_secret
#      STRIPE_PRICE_PRO=price_local_pro
#      STRIPE_PRICE_AI_PREMIUM=price_local_ai_premium
#      STRIPE_API_HOST=localhost:12111        # route Stripe SDK calls to stripe-mock
#      OPENROUTER_API_KEY=dummy
#      OPENROUTER_BASE_URL=http://127.0.0.1:4545/api/v1   # if using mock:ai

# 3. Build and run on port 3002
npm run build
PORT=3002 npm run start

# 4. (optional, for the checkout happy path) stripe-mock on :12111
docker run --rm -d -p 12111:12111 stripe/stripe-mock

# 5. (optional, for AI streaming) the OpenRouter mock
npm run mock:ai

# 6. Run the suites (in another terminal)
npm run test:endpoints   # ~58 assertions: ingest auth/validation/rate limits,
                         # sessions, lap detection, billing, signed webhooks,
                         # share links, leaderboards, tier gating
npm run test:realtime    # subscribes via websocket, ingests points, asserts
                         # they arrive through Supabase Realtime under RLS
```

Notes:

- Both suites default to `http://localhost:3002`; override with `BASE_URL` or a positional arg (`node scripts/test-endpoints.mjs http://localhost:3000`).
- The test helpers (`scripts/lib/supabase-test-auth.mjs`) default to the standard local-CLI keys; override with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` if your local stack differs.
- Webhook tests sign payloads with HMAC using `STRIPE_WEBHOOK_SECRET` (default `whsec_local_test_secret`) — it must match the value the server was started with.
- If stripe-mock isn't running, the checkout happy-path check is skipped (everything else still runs).
- Unit tests (`npm test`, Vitest) need no services at all: Salsa20 golden vectors, packet parsing, lap transitions, billing gates, safe-redirect validation.

## 9. Deployment

Self-hosted Docker deployment (the Dockerfile uses Next's standalone output, runs as a non-root user, and health-checks with busybox `wget`):

```bash
# one-off local build/run
docker compose up -d --build      # serves on :3000, reads .env.production

# scripted remote deploy (rsync + docker compose over SSH)
DEPLOY_HOST=your-server DEPLOY_USER=youruser DEPLOY_DIR=/opt/gt7-telemetry ./deploy.sh
```

`deploy.sh` requires a local `.env.production` (never committed), SSH key auth to the host, and Docker + Compose on the target. It excludes `mobile-app/`, `scripts/`, `supabase/`, `specs/`, and all env files from the rsync, copies `.env.production` separately, rebuilds, and waits for the container to report healthy.

Remember to point your production Stripe webhook at `https://<your-domain>/api/webhooks/stripe` and set `APP_URL`/`NEXT_PUBLIC_APP_URL` to the public URL.

## 10. Troubleshooting

**Mobile app crashes instantly / UDP never binds in Expo Go.**
Expo Go cannot load `react-native-udp`. Always use a dev-client/native build (`expo run:ios|android`) or an EAS build.

**iOS: capture starts but no packets ever arrive.**
iOS requires the Local Network permission, declared via `NSLocalNetworkUsageDescription` (already present in `mobile-app/app.json`). If you added or changed it, run a **fresh** `npx expo prebuild` so it lands in the native project, reinstall, and accept the permission prompt. Also check: correct PS5 IP, both devices on the same subnet, router AP-isolation disabled, GT7 actually in a driving session.

**`DATABASE_URL` connections time out or fail with `ENETUNREACH`.**
On newer Supabase projects, the direct host `db.<ref>.supabase.co` resolves to **IPv6 only**. From IPv4-only networks (most home ISPs, many containers) use the session pooler URL instead: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` (this is what `.env.example` shows).

**Everything worked yesterday; today every Supabase call fails.**
Free-tier Supabase projects pause after inactivity. Restore the project from the dashboard.

**`test:endpoints` fails on the checkout happy path only.**
stripe-mock isn't running on `:12111`, or the server wasn't started with `STRIPE_API_HOST=localhost:12111`. Note the suite prints "stripe-mock not running — skipping" when it can't reach the mock; a hard failure means the server-side `STRIPE_API_HOST` is missing.

**Webhook tests return 400 "signature".**
The `STRIPE_WEBHOOK_SECRET` used by the running server differs from the one the test signs with (default `whsec_local_test_secret`). Set both to the same value.

**Login succeeds but the session doesn't persist.**
The auth middleware must propagate cookies to both the request and the response (already handled in `middleware.ts`); if you modify it, keep the `setAll` behavior intact.
