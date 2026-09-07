# POST /api/ingest

Ingests batched GT7 telemetry from the mobile capture app. Performs API-key
auth, fail-closed rate limiting, server-side lap detection, session lifecycle
management, and personal-best leaderboard updates.

## Authentication

`Authorization: Bearer <api_key>` header (raw API key created in Settings; the
server compares its SHA-256 hash against `api_keys.key_hash`). No Supabase
session cookie is required — this route is excluded from the auth middleware.

## Rate limit

12 POSTs per minute per API key, enforced via the `consume_rate_limit` RPC.
**Fail-closed:** if the rate-limit backend errors, the request is rejected
with `503` instead of being allowed through.

## Request body

Validated with zod. `points` must contain 1–10000 entries; all numeric fields
must be finite numbers (no `NaN`/`Infinity`).

```jsonc
{
  "session_id": "uuid",          // optional — continue an existing session
  "car_name": "Toyota GR Supra RZ '20",   // optional, used on session create
  "car_code": 1234,              // optional, used on session create
  "track_name": "Tokyo Expressway East",  // optional, used on session create
  "is_new_session": true,        // optional — force a new session (ignored when session_id is set)
  "is_final": false,             // optional — close the session (sets ended_at)
  "points": [
    {
      "packet_id": 4521,         // required, int — unique per session
      "posX": 12.3, "posY": 0.5, "posZ": -45.2,
      "velX": 3.1, "velY": 0.02, "velZ": -12.4,
      "rotX": 0.01, "rotY": 0.98, "rotZ": -0.02, "rotW": 0.19,
      "rpm": 5200,
      "speed_ms": 36.5,
      "turbo_boost": 0.8,
      "throttle": 180,           // 0-255
      "brake": 0,                // 0-255
      "gear": 5,
      "suggested_gear": 5,
      "fuel_level": 45.2,
      "fuel_capacity": 65,
      "tire_temp_fl": 78, "tire_temp_fr": 82, "tire_temp_rl": 76, "tire_temp_rr": 80,
      "tire_radius_fl": 0.33, "tire_radius_fr": 0.33, "tire_radius_rl": 0.34, "tire_radius_rr": 0.34,
      "flags": 11,
      "current_lap": 3,          // 1-based on track, 0 in menus/replays
      "total_laps": 5,           // race lap count, 0 for time trial
      "best_lap_ms": 92345,      // -1 when unset
      "last_lap_ms": 93012       // -1 when unset
    }
  ]
}
```

The canonical wire type is `IngestPoint` in `src/shared/telemetry.ts`
(position/velocity/rotation keys are camelCase; everything else snake_case).
All point fields except `packet_id` are optional.

## Session resolution

1. `session_id` provided → the session must exist **and** belong to the API
   key's user, otherwise `404`. A mismatched id is never silently replaced
   with a new session. `is_new_session` is ignored in this case.
2. No `session_id`, `is_new_session` not set → reuse the caller's most recent
   open session (`ended_at IS NULL`) started within the last 4 hours.
3. Otherwise → create a new session with `car_name`/`car_code`/`track_name`.

## Lap detection (server-side)

Implemented by the pure function `processLapTransitions` in
`src/lib/gt7/laps.ts`, seeded with the session's stored `current_lap`:

- Each stored point gets `lap_number = current_lap` from its packet;
  `current_lap = 0` (menu/out of track) or missing → `lap_number = null`.
- When `current_lap` increases from N to N+1 (N ≥ 1), lap N is complete. Its
  time is the `last_lap_ms` of the first point of lap N+1 (when > 0; stored
  as `-1` in `lap_data` when the game reported no usable time).
- Jumps of more than one lap (dropped batches) record the intermediate laps
  with no time; only the lap right before the new lap claims `last_lap_ms`.
- Decreases of `current_lap` (race restart, menu) never create laps.

Effects per request:

- `telemetry_points`: upserted in chunks of 500 with
  `ON CONFLICT (session_id, packet_id) DO NOTHING` — retried batches are
  idempotent and skipped rows are not counted in `points_inserted`.
- `lap_data`: one row per completed lap, upserted on
  `(session_id, lap_number)`.
- `telemetry_sessions`: `current_lap`, `total_laps` (max of known values and
  the current lap), `last_lap_ms`, and `best_lap_ms` (min positive of stored
  and batch values) are updated when the batch carries on-track lap state;
  `ended_at = now()` when `is_final` is true.
- `leaderboard_entries`: when a completed lap with a positive time beats the
  caller's personal best on the session's `track_name` (or no entry exists),
  the entry is upserted on `(user_id, track_name)` with `car_name`,
  `session_id`, `lap_number`, `achieved_at`. Best-effort: failures never fail
  the ingest.
- `api_keys.last_used` is refreshed on success.

## Response — 200

```json
{
  "status": "ok",
  "session_id": "uuid",
  "points_received": 600,
  "points_inserted": 598,
  "laps_completed": [
    { "lap_number": 2, "lap_time_ms": 93012 }
  ],
  "current_lap": 3
}
```

`points_inserted` < `points_received` means duplicate `packet_id`s were
skipped (retry or overlap). `lap_time_ms` is `null` when the game reported no
usable time for that lap. `current_lap` is the session's lap after this batch
(unchanged if the batch had no on-track points).

## Error responses

| Status | Body                                              | When                                                       |
| ------ | ------------------------------------------------- | ---------------------------------------------------------- |
| 400    | `{ "error": "Invalid JSON" }`                     | Body is not valid JSON                                     |
| 400    | `{ "error": "Invalid request body", "details": [{ "path", "message" }] }` | zod validation failed (first 10 issues) |
| 401    | `{ "error": "Unauthorized" }`                     | Missing/empty Bearer token                                 |
| 401    | `{ "error": "Invalid API key" }`                  | Key hash not found                                         |
| 404    | `{ "error": "Session not found" }`                | `session_id` missing or owned by another user              |
| 429    | `{ "error": "Rate limited" }`                     | Over 12 requests/minute for this key                       |
| 500    | `{ "error": "Failed to create session" }`         | Session insert failed                                      |
| 500    | `{ "error": "Failed to ingest telemetry" }`       | Point chunk insert failed                                  |
| 503    | `{ "error": "Rate limiter unavailable, try again" }` | `consume_rate_limit` RPC errored (fail-closed)          |
