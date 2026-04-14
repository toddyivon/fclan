# POST /api/ingest

Ingests telemetry data from the mobile capture app. Rate-limited.

## Authentication
Bearer token via `Authorization: Bearer <api_key>` header (API key, not user token).

## Request Body
```jsonc
{
  "session_id": "uuid",       // Created by mobile app on new session
  "car_name": "Toyota GR Supra RZ '20",
  "car_code": 1234,
  "track_name": "Tokyo Expressway East",
  "points": [                  // Batched array of telemetry points
    {
      "packet_id": 4521,
      "pos_x": 12.3, "pos_y": 0.5, "pos_z": -45.2,
      "vel_x": 3.1, "vel_y": 0.02, "vel_z": -12.4,
      "rpm": 5200,
      "speed_ms": 36.5,
      "turbo_boost": 0.8,
      "throttle": 180,
      "brake": 0,
      "gear": 5,
      "suggested_gear": 5,
      "fuel_level": 45.2,
      "fuel_capacity": 65,
      "tire_temp_fl": 78, "tire_temp_fr": 82, "tire_temp_rl": 76, "tire_temp_rr": 80,
      "flags": 11
    }
  ],
  "is_new_session": true        // First batch, create session record
}
```

## Response
```json
{
  "status": "ok",
  "session_id": "uuid",
  "points_received": 50
}
```

## Behavior
- If `is_new_session`: creates `telemetry_sessions` record, returns session_id
- If session_id already exists (and belongs to same user via key lookup): appends points
- Session auto-detection: if no new data for >30s, marks session ended
- Rate limit: 12 POSTs per minute per API key
- Validates API key against `api_keys.key_hash`
- Updates `api_keys.last_used` on success
