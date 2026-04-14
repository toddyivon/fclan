import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { consumeAiAnalysis } from "@/lib/billing/quota";

interface TelemetryRow {
  speed_ms: number | null;
  rpm: number | null;
}

function summarize(points: TelemetryRow[]): { speedKphMin: number; speedKphMax: number; rpmMin: number; rpmMax: number } {
  let sMin = Infinity, sMax = -Infinity, rMin = Infinity, rMax = -Infinity;
  for (const p of points) {
    const s = p.speed_ms ?? 0;
    const r = p.rpm ?? 0;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
  }
  if (!Number.isFinite(sMin)) sMin = sMax = rMin = rMax = 0;
  return {
    speedKphMin: Math.round(sMin * 3.6),
    speedKphMax: Math.round(sMax * 3.6),
    rpmMin: Math.round(rMin),
    rpmMax: Math.round(rMax),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session_id, lap_number } = await req.json();
  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const { data: session } = await supabase
    .from("telemetry_sessions")
    .select("id, car_name, track_name, user_id")
    .eq("id", session_id)
    .eq("user_id", user.id)
    .single();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const quotaResult = await consumeAiAnalysis(supabase, user.id);
  if (!quotaResult.allowed) {
    return NextResponse.json(
      { error: quotaResult.reason ?? "Quota exceeded", quota: quotaResult.quota },
      { status: quotaResult.reason === "Upgrade required" ? 403 : 429 }
    );
  }

  const { data: points } = await supabase
    .from("telemetry_points")
    .select("speed_ms, rpm")
    .eq("session_id", session_id)
    .order("packet_id", { ascending: true })
    .limit(3600);

  const system = `You are an expert Gran Turismo 7 racing coach. Analyze the provided telemetry and give actionable suggestions to improve lap times. Focus on:
- Braking points and zones
- Throttle application on corner exit
- Racing line optimization
- Tire temperature management
- Gear usage and shift points
Be specific with numbers. Keep responses to 2-4 paragraphs plus 3-5 bullet suggestions.`;

  const summary = points && points.length > 0
    ? (() => {
        const s = summarize(points);
        return `Car: ${session.car_name ?? "Unknown"}, Track: ${session.track_name ?? "Unknown"}. Points: ${points.length}. Speed: ${s.speedKphMin}-${s.speedKphMax} KPH. RPM: ${s.rpmMin}-${s.rpmMax}.`;
      })()
    : "No telemetry data available.";

  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

  const result = streamText({
    model: openrouter("openai/gpt-4o-mini"),
    system,
    prompt: `Analyze this GT7 driving session:\n\n${summary}\n\n${typeof lap_number === "number" && lap_number >= 0 ? `Focus on lap ${lap_number}.\n` : ""}Provide specific driving improvements.`,
  });

  return result.toTextStreamResponse();
}
