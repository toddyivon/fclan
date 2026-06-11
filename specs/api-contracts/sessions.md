# Sessions API Contracts

All endpoints require a Supabase cookie session (user auth). RLS scopes every
read/write to the caller's own rows; unknown or foreign session ids return 404.

## GET /api/sessions

Paginated list of the caller's telemetry sessions, ordered by `started_at` desc.

Query params:
- `page` — 1-based page number (default 1; values < 1 clamp to 1)
- `limit` — page size (default 20, max 50)
- `track` — case-insensitive substring match on `track_name` (`ilike %track%`)
- `car` — case-insensitive substring match on `car_name` (`ilike %car%`)

Tier rule: **free** users only see sessions with `started_at >= now() - 7 days`
(enforced server-side in the query, mirroring the retention purge).

Response `200`:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "car_name": "Toyota GR Supra RZ '20",
      "track_name": "Tokyo Expressway East",
      "started_at": "2026-04-13T15:00:00Z",
      "ended_at": "2026-04-13T15:45:00Z",
      "total_laps": 24,
      "best_lap_ms": 78420,
      "current_lap": 24
    }
  ],
  "page": 1,
  "total": 156
}
```
`total` is the exact filtered count (PostgREST `count: 'exact'`).

Errors: `401 {error}` unauthenticated, `500 {error}` query failure.

---

## GET /api/sessions/:id

Session detail + ordered laps + telemetry point count.

Response `200`:
```json
{
  "session": {
    "id": "uuid",
    "car_name": "...",
    "car_code": 1234,
    "track_name": "...",
    "started_at": "...",
    "ended_at": null,
    "total_laps": 24,
    "best_lap_ms": 78420,
    "current_lap": 24,
    "last_lap_ms": 79110
  },
  "laps": [
    { "lap_number": 1, "start_ms": 0, "end_ms": 82100, "lap_time_ms": 82100 }
  ],
  "pointCount": 14382
}
```
Laps are ordered by `lap_number` asc.

Errors: `401`, `404 {error}` when not found / not owned, `500`.

## DELETE /api/sessions/:id

Deletes the caller's own session. `ON DELETE CASCADE` removes its
telemetry points, lap data and AI analyses.

Responses: `204` (no body) on success, `401`, `404` when not found / not owned,
`500 {error}`.

---

## GET /api/sessions/:id/points

Downsampled telemetry points for charting.

Query params:
- `lap` — non-negative integer; filters on `lap_number`. `400` if invalid.
- `fields` — `basic` (default) or `full`; `400` otherwise.
  - `basic`: `packet_id, speed_ms, rpm, throttle, brake, gear, lap_number`
  - `full`: basic + `pos_x, pos_z, tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr, fuel_level`

Implementation notes:
- PostgREST truncates unlimited selects at 1000 rows, so the handler pages
  server-side with `.range()` in 1000-row chunks (ordered by `packet_id` asc)
  until exhausted, with a safety cap of **100,000** scanned points.
- The full set is then bucket-downsampled to at most **2000** points:
  `packet_id`/`lap_number` come from each bucket's first row, `gear` is the
  rounded bucket average, all other fields are bucket averages (nulls skipped).

Response `200`:
```json
{ "points": [ { "packet_id": 0, "speed_ms": 51.2, "...": 0 } ], "total": 14382, "sampled": 2000 }
```
`total` = points scanned after the lap filter (true count up to the 100k cap);
`sampled` = points returned.

Errors: `400`, `401`, `404`, `500`.

---

## GET /api/sessions/:id/export?format=csv|json

Full-resolution telemetry export. **Pro / AI Premium only**
(`telemetry_export` feature gate).

Query params:
- `format` — `csv` (default) or `json`; `400` otherwise.

Gating & access:
- Ownership is checked with the user (RLS) client → `404` if not owned.
- Free tier → `403 { "error": "Telemetry export requires the Pro plan", "upgrade": true }`.
- The point read uses the **service-role** client, paginated with `.range()` in
  1000-row chunks, ordered by `packet_id` asc, capped at **200,000** points.

Both formats stream the body chunk-by-chunk via `ReadableStream` (no giant
in-memory string) with headers:
- `Content-Disposition: attachment; filename="gt7-session-<id>.csv|json"`
- `Cache-Control: no-store`

CSV (`text/csv`): header row with every `telemetry_points` column except
`id`/`created_at`, i.e.
`session_id,packet_id,timestamp,pos_x,pos_y,pos_z,vel_x,vel_y,vel_z,rot_x,rot_y,rot_z,rot_w,rpm,speed_ms,turbo_boost,throttle,brake,gear,suggested_gear,fuel_level,fuel_capacity,tire_temp_fl,tire_temp_fr,tire_temp_rl,tire_temp_rr,tire_radius_fl,tire_radius_fr,tire_radius_rl,tire_radius_rr,flags,lap_number`.
Cells containing `,`, `"` or newlines are quoted with `""` escaping; nulls are
empty cells.

JSON (`application/json`):
```json
{ "session": { "...": "telemetry_sessions row" }, "laps": [ "lap_data rows asc" ], "points": [ "rows with the CSV columns above" ] }
```

Errors: `400`, `401`, `403 (upgrade)`, `404`, `500`.
