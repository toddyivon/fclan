# AI Analysis API

Two endpoints: a streaming analysis generator and a history listing.
Both authenticate via the Supabase session cookie (same-origin web app).

---

## POST /api/ai/analyze

Computes real telemetry statistics for a session (optionally a single lap),
sends them to the model (`openai/gpt-4o-mini` via OpenRouter) and streams the
coaching text back as plain text. The completed analysis is persisted to
`ai_analyses`.

`OPENROUTER_BASE_URL` (env) overrides the OpenRouter endpoint so tests can
point at a local mock.

### Auth
Supabase session cookie. `401 {"error":"Unauthorized"}` without one.

### Tier gate & quota
- Tier gate first (`ai_analysis` feature): Free → `403 {"error":"upgrade_required","upgrade":true}`.
- Quota is consumed atomically via the `consume_ai_quota` RPC (service role)
  only after telemetry has been validated, so empty sessions never burn a unit.
  Pro = 50/month, AI Premium = effectively unlimited (999999). Monthly window
  rolls lazily inside the RPC.
- If the model call fails after the quota was taken, the unit is refunded
  (`refund_ai_quota`).

### Request body
```json
{
  "session_id": "uuid",      // required
  "lap_number": 3            // optional; non-negative integer. Omit to analyze the whole session.
}
```

### Telemetry context sent to the model
Computed server-side in TypeScript from up to 20,000 `telemetry_points`
(paginated `.range()` reads of `speed_ms, rpm, throttle, brake, gear,
lap_number, packet_id`, filtered by `lap_number` when provided) plus
`lap_data` rows. Per lap:

- lap time (from `lap_data`)
- top / minimum speed (kph)
- % of samples at full throttle (raw throttle > 250 of 255)
- % of samples braking (raw brake > 25 of 255)
- gear-change count

Plus car/track names, the session's best lap and, when a target lap is given,
its delta versus the best lap. The same stats object is persisted as
`ai_analyses.analysis_json`.

### Success response — 200, streaming
Plain-text stream (`Content-Type: text/plain; charset=utf-8`) of the coaching
text. Read incrementally with `res.body.getReader()` + `TextDecoder`.

Quota state after consumption is exposed in response headers:

| Header             | Example                      |
|--------------------|------------------------------|
| `X-Quota-Used`     | `12`                         |
| `X-Quota-Limit`    | `50`                         |
| `X-Quota-Reset-At` | `2026-07-01T00:00:00+00:00`  |

On stream completion the server inserts into `ai_analyses`:
`{user_id, session_id, lap_number (−1 = whole session), analysis_text, model, analysis_json}`.

### Error responses
| Status | Body | Meaning |
|--------|------|---------|
| 400 | `{"error":"session_id required"}` / `{"error":"lap_number must be a non-negative integer"}` / `{"error":"Invalid JSON body"}` | bad input |
| 401 | `{"error":"Unauthorized"}` | no session cookie |
| 403 | `{"error":"upgrade_required","upgrade":true}` | Free tier (gate) — may include `quota` when raised by the RPC |
| 404 | `{"error":"Session not found"}` | session missing or not owned by caller |
| 422 | `{"error":"no_telemetry"}` | session (or requested lap) has zero telemetry points; quota NOT consumed |
| 429 | `{"error":"quota_exhausted","quota":{"used":50,"limit":50,"reset_at":"…"}}` | monthly quota used up |
| 500 | `{"error":"Failed to load telemetry"}` / `{"error":"Analysis failed"}` | server/model failure (quota refunded) |

`403`/`429` quota objects have the shape
`{"used": number, "limit": number, "reset_at": "timestamptz|null"}`.

---

## GET /api/ai/analyses

Lists the caller's saved analyses, newest first.

### Auth
Supabase session cookie. `401` without one. Rows are selected by
`user_id = auth user` (and RLS additionally scopes by session ownership).

### Query params
| Param | Default | Notes |
|-------|---------|-------|
| `session_id` | — | optional filter to one session |
| `limit` | 20 | clamped to 1–100 |

### Response — 200
```json
{
  "analyses": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "lap_number": 3,
      "analysis_text": "You're losing time on corner exit…",
      "model": "openai/gpt-4o-mini",
      "created_at": "2026-06-10T14:03:22.000Z"
    }
  ]
}
```

`lap_number` of `-1` means the analysis covered the whole session.
