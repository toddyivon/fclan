# Sessions API Contracts

## GET /api/sessions
Auth: Supabase session token (user auth)

Query params:
- `limit` (default 20, max 100)
- `offset` (default 0)
- `car` (filter by car name)
- `track` (filter by track name)
- `from` / `to` (date range)

Response:
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
      "best_lap_ms": 78420
    }
  ],
  "total": 156
}
```

---

## GET /api/sessions/:id/auth
Auth: Supabase session token

Returns session detail + lap data summary.

```json
{
  "id": "uuid",
  "car_name": "...",
  "track_name": "...",
  "started_at": "...",
  "total_laps": 24,
  "best_lap_ms": 78420,
  "laps": [
    { "lap_number": 1, "lap_time_ms": 82100, "start_ms": 0, "end_ms": 82100 }
  ]
}
```

---

## GET /api/sessions/:id/telemetry?lap=3&interval=10
Auth: Supabase session token

Returns downsampled telemetry points for a specific lap.
`interval` = sample every N packets (default 10). Prevents sending 3600 points per lap.
