# Security Audit — Consolidated Findings

Date: 2026-09-07 · Method: security-review skill checklist (OWASP10) + 3 parallel deep audits (one per implementation repo), evidence-based with file:line.

## Severity ranking (consolidated across 4 repos)

### CRITICAL — must fix before any launch

| # | Finding | Repo · file:line | Fix |
|---|---|---|---|
| C1 | Public Convex query returns `passwordHash` | Pro · convex/users.ts:23-31 | safe projection like getUserForAuth |
| C2 | Self-service privilege escalation: updateUser accepts role/isActive/subscription | Pro · users.ts:272-283 | remove privileged args from client mutations; admin-only mutation |
| C3 | Unguarded hard-deletes (any user deletes anyone): deleteUserById, deleteSession | Pro · users.ts:627, sessions.ts:186 | ctx.auth + admin check |
| C4 | Unauthenticated ranking/achievement mutations | Pro · leaderboard.ts:566,892,1010 | internalMutation |
| C5 | JWT hardcoded fallback secret | Pro · lib/jwt.ts:4 | throw at boot; env |
| C6 | Convex zero auth — anyone reads/writes any telemetry (ctx.auth never called; IDs caller-supplied) | 26 · functions.ts:6-68 | use ctx.auth.getUserIdentity() server-side |
| C7 | Bokeh cloud-mode IDOR — user_id from URL, token never verified, service-role client | dashboard · main.py:279,318,443 | verify JWT, resolve user server-side |

### HIGH

| # | Finding | Repo · file:line | Fix |
|---|---|---|---|
| H1 | demo backdoor in prod: demo_token_* = premium; plaintext master passwords | Pro · auth.ts:70-86, login/route.ts:35-39 | gate behind NODE_ENV!=production |
| H2 | refresh ignores validation result (stolen refresh token = indefinite refresh) | Pro · refresh/route.ts:55-58 | enforce valid + rotate/revoke |
| H3 | hasPermission default `true` (deny-by-default violated) | Pro · auth.ts:121 | default false |
| H4 | Next 14.1 → CVE-2025-29927 middleware auth bypass | Pro · package.json:42 | upgrade ≥14.2.25 |
| H5 | SSH password + AutoAddPolicy MITM in deploy | Pro · deploy_helper.py:30-38 | SSH keys + host-key pinning |
| H6 | RLS bypassed by service-role client everywhere | dashboard · supabase_client.py:10-23 | user-JWT client for user ops |
| H7 | Login simulated; zero route protection | 26 · login/page.tsx:14 | real auth |

### MEDIUM

- Pro: no rate limiting on auth routes (login/refresh/checkout); SameSite=Lax + no CSRF tokens; Stripe webhook in-memory Map; upload .gtrec unvalidated; missing dep socket.io in websocket-proxy; nginx no CSP.
- April: env.ts Zod bypass in 6 files (keys, share, admin×2, webhooks, share-page); no request-body size guard (Content-Length >3MB reject); no security headers in next.config.ts; LLM prompt injection surface (ai/analyze 108-109).
- 26: checkout unauthenticated (mint Stripe sessions); webhook verified BUT never applies state (paid users get nothing).
- dashboard: cookie lacks HttpOnly/Secure + localStorage session + token in URL query; DOM XSS innerHTML (dashboard.html:373-388); no rate limiting/password policy; error detail leaks; JWT verify_aud false.
- iOS: tokens plaintext in UserDefaults (Keychain needed); user-settable API base URL = credential exfil vector.

### LOW

- Pro: ignoreBuildErrors:true; images remotePatterns '**'; upload accept only; no CSP.
- April: duplicate rate-limit keys (observation, no fix).
- dashboard: signed-URL expiry OK (3600s, verified); storage bucket policies ACTIVE in migration (verified good vs schema.sql comment); no ATS exceptions; no CORS wildcard; no SQL concat.

## Verified-GOOD (do not regress)

April (strongest): RLS UPDATE users = name only; API keys sha256 + TOCTOU-safe create_api_key; ingest idempotency + service-role only; rate limits atomic fail-closed 503; Stripe signature + event_id idempotency + stale-guard; AI quota atomic consume/refund; zero dangerouslySetInnerHTML repo-wide; expo-secure-store for API key; https-only ingest URL; MySQL-free, current deps (next 16.2.3, stripe 22, zod 4.3.6); middleware pathname-only gating + safeRedirect.
Pro (good spots): no dangerouslySetInnerHTML; .env gitignored; no secrets in logs.
dashboard (good spots): no SQL concat; no ATS exceptions; signed URL 1h; no CORS wildcard.
26: .env gitignored; mobile Salsa20 key state-only (no password persisted).

## Pre-launch security gates (consolidated)

1. Fix C1-C7 (critical).
2. Delete/flag demo backdoors (H1-H3) and gate demo mode behind NODE_ENV.
3. Choose ONE data layer ownership model: never service-role for user-scoped ops (April already done right; Pro + dashboard switch).
4. Add security headers everywhere (CSP default-src 'self', frame-ancestors 'none', HSTS, Referrer-Policy) — April next.config.ts, Pro nginx, dashboard FastAPI middleware.
5. Add server-side rate limiting + account lockout to login/register (April has; Pro/dashboard/26 don't).
6. Verify Convex auth (C6) or remove Convex from the consolidated design — decision: since base is April (Supabase), Convex is NOT in the final stack: the 26 mobile sync and Pro's Convex schema are harvest-only. This eliminates C1-C4, C6 at once.
7. Password policy server-side + HttpOnly+Secure+SameSite=Strict cookies — unify on April's cookie pattern.
8. Wire Stripe webhook → DB with idempotent event storage (April's pattern), never in-memory.
9. Kill mobile hardcoded URLs; require settings-configured ingest URL pinned to owned domain (April does HTTPS validation).
10. iOS: Keychain for tokens; Android: SecureStore/Keystore equivalent.
