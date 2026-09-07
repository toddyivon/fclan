# Share API Contracts (public lap cards)

Shareable, revocable public links to a single lap (or a session's best lap).
Backed by the `shared_laps` table (`005_product_foundation.sql`): RLS allows
owners to SELECT/INSERT/DELETE their own rows; there are **no anon policies**
— public resolution happens exclusively through the service-role client on the
`/share/[token]` page. Tokens are 12 random bytes, base64url (~16 chars,
96 bits of entropy).

## POST /api/share

Creates a public share link for one of the caller's sessions. Requires a
Supabase cookie session.

Request body:
```json
{ "session_id": "uuid", "lap_number": 4 }
```
- `session_id` — required; must be a session owned by the caller (checked via
  the user client + RLS) → `404` otherwise.
- `lap_number` — optional non-negative integer; omit (or `null`) to share the
  session's **best lap** (resolved at view time). `400` if invalid.

Idempotency (light): if a non-revoked share already exists for the same
`(session_id, lap_number)` pair, the existing link is returned with `200`
instead of creating a duplicate.

Response `201` (new) / `200` (reused):
```json
{ "token": "Vc2k9qXf3LZw1a2b", "url": "https://app.example.com/share/Vc2k9qXf3LZw1a2b" }
```
`url` base is `serverEnv.APP_URL` when set, else the request origin.

Errors: `400 {error}` bad body, `401` unauthenticated, `404` session not
found / not owned, `500` insert failure.

## DELETE /api/share?id=<share_id>

Revokes a share link (soft delete: sets `revoked_at`; the row is kept).
Requires a cookie session.

- Ownership is verified with the user client (RLS-scoped select) → `404` if
  the share doesn't exist or isn't the caller's.
- The `revoked_at` update itself runs on the **service-role** client because
  `shared_laps` intentionally has no UPDATE policy.
- Revoking an already-revoked share is a no-op success (idempotent).

Responses: `200 {"ok": true}`, `400 {error}` missing id, `401`, `404`, `500`.

---

## GET /share/[token] (public page, not an API)

Server-rendered public lap card at `src/app/share/[token]/page.tsx`. **No
auth** — the path is outside the middleware `protectedPaths`; all reads use
the service-role client.

Resolution:
1. `shared_laps` by `token` with `revoked_at IS NULL` → `notFound()` (404 +
   noindex) for unknown or revoked tokens.
2. Loads the session (`car_name`, `track_name`, `started_at`, `best_lap_ms`)
   and `lap_data`. If the share has a `lap_number` it's used as-is; otherwise
   the fastest timed lap is picked. Lap time falls back to
   `session.best_lap_ms` if the lap row has no time.
3. Loads that lap's points — only `packet_id, speed_ms, pos_x, pos_z` —
   paged in 1000-row chunks (PostgREST truncation), capped at 20,000 scanned,
   stride-sampled to at most **2000** points.

Rendering: static SVG track trace (`pos_x`/`pos_z` polyline, violet stroke,
Z flipped to screen Y), static SVG speed sparkline (km/h), lap time via
`formatLapTime`, "GT7 Telemetry" badge, and a "Track your own laps" CTA to
`/signup`. `generateMetadata` emits lap-specific `title`/`description` plus
OpenGraph + Twitter tags (the token resolution is wrapped in React `cache()`
so metadata + page share one fetch per request).

## UI

- `src/components/sessions/share-button.tsx` — client `ShareButton`
  (`{sessionId, lapNumber?}`): POSTs `/api/share`, copies `url` to the
  clipboard, flashes "Copied!" for 2s ("Failed" on error).
- `src/components/sessions/session-header.tsx` — session detail header with
  the action row Export · Share · Delete.
