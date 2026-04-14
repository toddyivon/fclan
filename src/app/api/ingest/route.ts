import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

interface TelemetryPoint {
  packet_id: number;
  posX?: number; posY?: number; posZ?: number;
  velX?: number; velY?: number; velZ?: number;
  rpm?: number; speed_ms?: number; turbo_boost?: number;
  throttle?: number; brake?: number;
  gear?: number; suggested_gear?: number;
  fuel_level?: number; fuel_capacity?: number;
  tire_temp_fl?: number; tire_temp_fr?: number; tire_temp_rl?: number; tire_temp_rr?: number;
  tire_radius_fl?: number; tire_radius_fr?: number; tire_radius_rl?: number; tire_radius_rr?: number;
  flags?: number;
}

interface IngestRequest {
  session_id?: string;
  car_name?: string;
  car_code?: number;
  track_name?: string;
  points: TelemetryPoint[];
  is_new_session?: boolean;
}

const INGEST_LIMIT_PER_MIN = 12;
const CHUNK_SIZE = 500;
const AUTO_SESSION_WINDOW_SEC = 60;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function validateApiKey(apiKey: string): Promise<{ userId: string; keyId: string } | null> {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .single();
  if (!data) return null;
  return { userId: data.user_id, keyId: data.id };
}

async function checkRateLimit(apiKey: string): Promise<boolean> {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const { data, error } = await getServiceClient().rpc("consume_rate_limit", {
    p_key: `ingest:${keyHash}`,
    p_limit: INGEST_LIMIT_PER_MIN,
    p_window_seconds: 60,
  });
  if (error) {
    console.error("rate limit rpc failed", error);
    return true;
  }
  return data === true;
}

async function resolveSession(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  body: IngestRequest
): Promise<string | null> {
  if (body.session_id && !body.is_new_session) {
    const { data } = await supabase
      .from("telemetry_sessions")
      .select("id")
      .eq("id", body.session_id)
      .eq("user_id", userId)
      .single();
    if (data) return data.id;
  }

  if (!body.is_new_session) {
    const { data } = await supabase
      .from("telemetry_sessions")
      .select("id")
      .eq("user_id", userId)
      .is("ended_at", null)
      .gt("started_at", new Date(Date.now() - AUTO_SESSION_WINDOW_SEC * 1000).toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data: newSession } = await supabase
    .from("telemetry_sessions")
    .insert({
      user_id: userId,
      car_name: body.car_name,
      car_code: body.car_code,
      track_name: body.track_name,
    })
    .select("id")
    .single();
  return newSession?.id ?? null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyInfo = await validateApiKey(apiKey);
  if (!keyInfo) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  if (!(await checkRateLimit(apiKey))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: IngestRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.points) || body.points.length === 0) {
    return NextResponse.json({ error: "Points array required" }, { status: 400 });
  }
  if (body.points.length > 10_000) {
    return NextResponse.json({ error: "Batch too large" }, { status: 413 });
  }

  const supabase = getServiceClient();
  const sessionId = await resolveSession(supabase, keyInfo.userId, body);
  if (!sessionId) {
    return NextResponse.json({ error: "Failed to resolve session" }, { status: 500 });
  }

  const pointsToInsert = body.points.map((p) => ({
    session_id: sessionId,
    packet_id: p.packet_id,
    pos_x: p.posX, pos_y: p.posY, pos_z: p.posZ,
    vel_x: p.velX, vel_y: p.velY, vel_z: p.velZ,
    rpm: p.rpm, speed_ms: p.speed_ms, turbo_boost: p.turbo_boost,
    throttle: p.throttle, brake: p.brake,
    gear: p.gear, suggested_gear: p.suggested_gear,
    fuel_level: p.fuel_level, fuel_capacity: p.fuel_capacity,
    tire_temp_fl: p.tire_temp_fl, tire_temp_fr: p.tire_temp_fr,
    tire_temp_rl: p.tire_temp_rl, tire_temp_rr: p.tire_temp_rr,
    tire_radius_fl: p.tire_radius_fl, tire_radius_fr: p.tire_radius_fr,
    tire_radius_rl: p.tire_radius_rl, tire_radius_rr: p.tire_radius_rr,
    flags: p.flags,
  }));

  for (let i = 0; i < pointsToInsert.length; i += CHUNK_SIZE) {
    const chunk = pointsToInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("telemetry_points").insert(chunk);
    if (error) {
      console.error("ingest: failed to insert chunk", { offset: i, error: error.message });
      return NextResponse.json({ error: "Failed to ingest telemetry" }, { status: 500 });
    }
  }

  await supabase
    .from("api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("id", keyInfo.keyId);

  return NextResponse.json({
    status: "ok",
    session_id: sessionId,
    points_received: body.points.length,
  });
}
