# GT7 Telemetry

A telemetry SaaS for **Gran Turismo 7**. Your PlayStation streams encrypted telemetry over UDP at 60 Hz; a companion phone app decrypts it on the fly and forwards it to the cloud; a web dashboard turns it into live gauges, lap charts, track maps, ghost replays, fuel strategy, community leaderboards, and AI-powered lap coaching.

No game mods, no capture card, no PC on the same network — just GT7's built-in Simulator Interface, a phone, and a browser.

## How it works

```
┌─────────────┐  UDP :33740 (Salsa20,    ┌──────────────────┐
│  PS4 / PS5  │  296-byte pkts @ 60Hz)   │   Mobile app      │
│    GT7      │ ───────────────────────► │  (Expo / RN)      │
│             │ ◄─────────────────────── │  decrypts Salsa20,│
└─────────────┘  heartbeat 'A' :33739    │  parses, batches  │
                 (every 10s)             └────────┬─────────┘
                                                  │ HTTPS POST /api/ingest
                                                  │ (Bearer API key)
                                                  ▼
                                         ┌──────────────────┐
                                         │  Next.js 16 API   │
                                         │  (Zod-validated,  │
                                         │  rate-limited)    │
                                         └────────┬─────────┘
                                                  │ service role insert
                                                  ▼
                                         ┌──────────────────┐
                                         │     Supabase      │
                                         │ Postgres + RLS +  │
                                         │ Auth + Realtime   │
                                         └────────┬─────────┘
                                                  │ WebSocket (RLS-scoped)
                                                  ▼
                                         ┌──────────────────┐      ┌────────────┐
                                         │  Web dashboard    │ ───► │ OpenRouter │
                                         │  live telemetry,  │      │ (AI lap    │
                                         │  analysis, laps   │ ◄─── │  analysis) │
                                         └──────────────────┘      └────────────┘
```

The GT7 wire protocol lives in one canonical module — `src/shared/gt7/` (`salsa20.ts` + `packet.ts`). The cipher is unit-tested against pycryptodome golden vectors and the packet layout is verified against PDTools / gt7dashboard offsets. The mobile app carries byte-for-byte copies in `mobile-app/src/gt7/` (keep them in sync).

## Features by tier

| Feature | Free | Pro $9.99/mo | AI Premium $24.99/mo |
|---|:---:|:---:|:---:|
| Live telemetry dashboard (speed, RPM, gear) | ✓ | ✓ | ✓ |
| Mobile capture app | ✓ | ✓ | ✓ |
| Session history | 7 days | Unlimited | Unlimited |
| Basic charts (speed, RPM) | ✓ | ✓ | ✓ |
| Interactive track map | — | ✓ | ✓ |
| Lap comparison overlay | — | ✓ | ✓ |
| Tire temperature visualization | — | ✓ | ✓ |
| Telemetry export (CSV / JSON) | — | ✓ | ✓ |
| AI lap analysis (streaming) | — | 50 / month | Unlimited |
| Ghost lap replay | — | — | ✓ |
| Predictive fuel & tire strategy | — | — | ✓ |
| AI coaching | — | — | ✓ |
| API keys | 1 | 5 | Unlimited |

Also in the box: lap consistency scoring, public share links for laps (`/share/<token>`), community leaderboards per track, a daily-races hub, and an admin panel (user/stats management). Billing runs on Stripe Checkout + Customer Portal with webhook-driven subscription sync, idempotent event handling, optional annual pricing, and a 7-day trial for first-time subscribers.

## Stack

- **Web:** Next.js 16.2.3 (App Router) · React 19 · Tailwind CSS v4 · shadcn-style UI · Recharts · Zustand · Framer Motion
- **Backend:** Supabase (Postgres, Auth, Realtime, Row Level Security) · raw SQL migrations via Supabase CLI · Zod-validated env (`src/env.ts`)
- **AI:** Vercel AI SDK + OpenRouter (`openai/gpt-4o-mini`), streamed responses
- **Billing:** Stripe (subscriptions, webhooks, customer portal)
- **Mobile:** Expo SDK 53 · React Native 0.79 · Expo Router · `react-native-udp` (native build required — Expo Go does **not** work)
- **Ops:** multi-stage Dockerfile (standalone output) · docker-compose · `deploy.sh` for self-hosted deploys

## Repository layout

```
src/
  app/
    (marketing)/        # public landing page
    (dashboard)/        # authed app: dashboard, sessions, analysis,
                        #   leaderboards, races, settings, admin
    api/                # ingest, sessions, ai, billing, webhooks, keys,
                        #   share, leaderboards, admin, me
    share/[token]/      # public lap share pages
    login/ signup/ ...  # Supabase auth flows
  components/           # dashboard, sessions (track map, ghost replay,
                        #   fuel strategy, lap compare...), analysis, ui
  lib/                  # supabase clients, billing (gate/quota/stripe),
                        #   auth, gt7 helpers
  shared/gt7/           # canonical Salsa20 + packet decoder (+ tests)
  env.ts                # Zod-validated environment
mobile-app/             # Expo capture app (UDP listener, decrypt, ingest)
supabase/migrations/    # 001–006, applied with the Supabase CLI
scripts/                # E2E test suites + OpenRouter mock
specs/                  # product spec, data model, API contracts
```

API contracts are documented in `specs/api-contracts/` (`ingest.md`, `sessions.md`, `billing.md`, `share.md`, `ai-analysis.md`); the product spec is `specs/spec.md` and the data model `specs/data-model.md`.

## Quickstart

```bash
# 1. Clone and install
git clone <repo-url> && cd gt7April && npm install

# 2. Configure environment
cp .env.example .env.local   # fill in Supabase, Stripe, OpenRouter values

# 3. Run
npm run dev                  # http://localhost:3000
```

You'll need a Supabase project with the migrations applied, Stripe products, and an OpenRouter key — the full walkthrough (including the mobile app and a fully local, offline test stack) is in **[SETUP.md](./SETUP.md)**.

## Testing

```bash
npm test                # vitest unit tests (cipher vectors, packet parsing,
                        #   lap logic, billing gates, safe redirects)
npm run lint            # eslint
npm run typecheck       # tsc --noEmit

# End-to-end, against a running app + local Supabase stack:
npm run test:endpoints  # ~58 assertions across ingest, auth, sessions,
                        #   billing, webhooks, share links, leaderboards
npm run test:realtime   # full live-telemetry pipeline over websockets
npm run mock:ai         # OpenAI-compatible mock on :4545 for offline AI tests
```

The E2E suites expect the local Supabase stack (`supabase start`), applied migrations, and the production build running on port 3002 — step-by-step instructions in [SETUP.md](./SETUP.md#8-running-the-full-local-test-suite). The Stripe checkout happy path additionally uses [stripe-mock](https://github.com/stripe/stripe-mock) on port 12111.

## Deployment

Self-hosted via Docker:

```bash
# multi-stage build (node:22-alpine, Next standalone output, non-root user,
# wget healthcheck) + compose with memory/cpu limits
DEPLOY_HOST=your-server DEPLOY_DIR=/opt/gt7-telemetry ./deploy.sh
```

`deploy.sh` rsyncs the project (minus secrets, mobile app, and dev folders) to the target host, copies your local `.env.production`, and runs `docker compose up -d --build`, waiting for the container healthcheck. See [SETUP.md](./SETUP.md#9-deployment) for details.

## License

No license file is currently included in this repository; all rights reserved by default.
