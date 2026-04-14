# POST /api/ai/analyze

Sends telemetry data to OpenAI for analysis and driving suggestions.

## Auth
Bearer token via Supabase session (user auth).

## Tier check
- Free: 403 Forbidden (upgrade to Pro required)
- Pro: allowed, 50 analyses/month, queued if system busy
- AI Premium: allowed, unlimited, priority queue

## Request Body
```json
{
  "session_id": "uuid",
  "lap_number": 3,
  "analysis_type": "lap_optimization"
}
```

## Response (streaming)
```jsonl
{"type":"delta","content":"I noticed you're losing approximately 0.8 seconds on"}
{"type":"delta","content":" the exit of Turn 4. Compared to your faster laps,"}
{"type":"delta","content":" you brake too early and lift off throttle 200m sooner"}
{"type":"done","analysis":{"time_lost_points":[...],"suggestions":["Brake 30m later into Turn 4","Maintain throttle through apex of Turn 6",...],"lap_delta_ms":820}}
```

## Analysis prompt context
The AI receives:
- Lap telemetry summary (throttle %, brake %, avg speed, min speed in corners, RPM range, gear shifts)
- Track info (from GT7Tracks database: length, corners, elevation)
- Car info (PP, tire compound)
- Comparison to user's fastest lap on same track/car combo
