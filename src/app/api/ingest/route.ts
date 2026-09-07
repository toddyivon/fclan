import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { z } from "zod";
import { serverEnv } from "@/env";
import { processLapTransitions, type CompletedLap } from "@/lib/gt7/laps";
import type { IngestPoint } from "@/shared/telemetry";

const INGEST_LIMIT_PER_MIN = 12;
const CHUNK_SIZE = 500;
const SESSION_REUSE_WINDOW_MS = 4 * 60 * 60 * 1000; // reuse open sessions started <4h ago

const finite = z.number().finite();

const pointSchema = z.object({
  packet_id: z.number().int().finite(),
  posX: finite.optional(), posY: finite.optional(), posZ: finite.optional(),
  velX: finite.optional(), velY: finite.optional(), velZ: finite.optional(),
  rotX: finite.optional(), rotY: finite.optional(), rotZ: finite.optional(), rotW: finite.optional(),
  rpm: finite.optional(), speed_ms: finite.optional(), turbo_boost: finite.optional(),
  throttle: finite.optional(), brake: finite.optional(),
  gear: finite.optional(), suggested_gear: finite.optional(),
  fuel_level: finite.optional(), fuel_capacity: finite.optional(),
  tire_temp_fl: finite.optional(), tire_temp_fr: finite.optional(),
  tire_temp_rl: finite.optional(), tire_temp_rr: finite.optional(),
  tire_radius_fl: finite.optional(), tire_radius_fr: finite.optional(),
  tire_radius_rl: finite.optional(), tire_radius_rr: finite.optional(),
  flags: z.number().int().finite().optional(),
  current_lap: z.number().int().finite().optional(),
  total_laps: z.number().int().finite().optional(),
  best_lap_ms: z.number().int().finite().optional(),
  last_lap_ms: z.number().int().finite().optional(),
});

const bodySchema = z.object({
  session_id: z.uuid().optional(),
  car_name: z.string().trim().max(200).optional(),
  car_code: z.number().int().finite().optional(),
  track_name: z.string().trim().max(200).optional(),
  is_new_session: z.boolean().optional(),
  is_final: z.boolean().optional(),
  points: z.array(pointSchema).min(1).max(10_000),
});

type IngestBody = z.infer<typeof bodySchema>;

function getServiceClient() {
  return createClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

type ServiceClient = ReturnType<typeof getServiceClient>;

async function validateApiKey(
  supabase: ServiceClient,
  apiKey: string
): Promise<{ userId: string; keyId: string } | null> {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const { data } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .single();
  if (!data) return null;
  return { userId: data.user_id, keyId: data.id };
}

/** Fail-closed rate limit: backend errors deny the request (503). */
async function checkRateLimit(
  supabase: ServiceClient,
  apiKey: string
): Promise<"ok" | "limited" | "unavailable"> {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: `ingest:${keyHash}`,
    p_limit: INGEST_LIMIT_PER_MIN,
    p_window_seconds: 60,
  });
  if (error) {
    console.error("ingest: rate limit rpc failed", error.message);
    return "unavailable";
  }
  return data === true ? "ok" : "limited";
}

interface SessionRow {
  id: string;
  track_name: string | null;
  car_name: string | null;
  car_code: number | null;
  current_lap: number | null;
  total_laps: number | null;
  best_lap_ms: number | null;
  last_lap_ms: number | null;
}

const SESSION_COLUMNS =
  "id, track_name, car_name, car_code, current_lap, total_laps, best_lap_ms, last_lap_ms";

type ResolveResult =
  | { ok: true; session: SessionRow }
  | { ok: false; status: 404 | 500; error: string };

async function resolveSession(
  supabase: ServiceClient,
  userId: string,
  body: IngestBody
): Promise<ResolveResult> {
  // Explicit session_id must exist and belong to the caller — never create
  // a replacement silently.
  if (body.session_id) {
    const { data } = await supabase
      .from("telemetry_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", body.session_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return { ok: false, status: 404, error: "Session not found" };
    return { ok: true, session: data as SessionRow };
  }

  // No session_id: reuse the most recent open session started within the
  // reuse window, unless the client explicitly asks for a new one.
  if (!body.is_new_session) {
    const cutoff = new Date(Date.now() - SESSION_REUSE_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("telemetry_sessions")
      .select(SESSION_COLUMNS)
      .eq("user_id", userId)
      .is("ended_at", null)
      .gt("started_at", cutoff)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { ok: true, session: data as SessionRow };
  }

  const { data: created, error } = await supabase
    .from("telemetry_sessions")
    .insert({
      user_id: userId,
      car_name: body.car_name ?? null,
      car_code: body.car_code ?? null,
      track_name: body.track_name ?? null,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !created) {
    console.error("ingest: failed to create session", error?.message);
    return { ok: false, status: 500, error: "Failed to create session" };
  }
  return { ok: true, session: created as SessionRow };
}

/** Highest on-track current_lap in the batch (0 when no on-track points). */
function maxOnTrackLap(points: IngestPoint[]): number {
  let max = 0;
  for (const p of points) {
    const lap = p.current_lap;
    if (typeof lap === "number" && Number.isFinite(lap) && lap >= 1) {
      max = Math.max(max, Math.floor(lap));
    }
  }
  return max;
}

/**
 * A new race in the same open session: GT7 resets current_lap to 1, and the
 * lap_data upsert keyed on (session_id, lap_number) would overwrite the
 * previous race's lap times. Close the current session and move this batch to
 * a fresh one — the response's session_id makes the mobile app adopt it.
 */
async function rotateSession(
  supabase: ServiceClient,
  userId: string,
  current: SessionRow,
  body: IngestBody
): Promise<ResolveResult> {
  const { error: endError } = await supabase
    .from("telemetry_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", current.id);
  if (endError) {
    console.error("ingest: failed to close session on lap regression", endError.message);
  }

  const { data: created, error } = await supabase
    .from("telemetry_sessions")
    .insert({
      user_id: userId,
      car_name: body.car_name ?? current.car_name,
      car_code: body.car_code ?? current.car_code,
      track_name: body.track_name ?? current.track_name,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !created) {
    console.error("ingest: failed to create session after lap regression", error?.message);
    return { ok: false, status: 500, error: "Failed to create session" };
  }
  return { ok: true, session: created as SessionRow };
}

/**
 * telemetry_points integer columns; some clients send floats and the whole
 * chunk insert would 500, so round instead of rejecting.
 */
function roundInt(v: number | undefined): number | undefined {
  return v === undefined ? undefined : Math.round(v);
}

async function maybeUpdateLeaderboard(
  supabase: ServiceClient,
  userId: string,
  session: SessionRow,
  completedLaps: { lapNumber: number; lapTimeMs: number | null }[]
) {
  if (!session.track_name) return;

  let best: { lapNumber: number; lapTimeMs: number } | null = null;
  for (const lap of completedLaps) {
    if (lap.lapTimeMs !== null && lap.lapTimeMs > 0 &&
        (best === null || lap.lapTimeMs < best.lapTimeMs)) {
      best = { lapNumber: lap.lapNumber, lapTimeMs: lap.lapTimeMs };
    }
  }
  if (!best) return;

  const { data: existing } = await supabase
    .from("leaderboard_entries")
    .select("lap_time_ms")
    .eq("user_id", userId)
    .eq("track_name", session.track_name)
    .maybeSingle();

  if (existing && existing.lap_time_ms <= best.lapTimeMs) return;

  const { error } = await supabase
    .from("leaderboard_entries")
    .upsert(
      {
        user_id: userId,
        track_name: session.track_name,
        car_name: session.car_name,
        lap_time_ms: best.lapTimeMs,
        session_id: session.id,
        lap_number: best.lapNumber,
        achieved_at: new Date().toISOString(),
      },
      { onConflict: "user_id,track_name" }
    );
  if (error) {
    // Leaderboard is best-effort; never fail the ingest for it.
    console.error("ingest: leaderboard upsert failed", error.message);
  }
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

  const supabase = getServiceClient();

  const keyInfo = await validateApiKey(supabase, apiKey);
  if (!keyInfo) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const rate = await checkRateLimit(supabase, apiKey);
  if (rate === "unavailable") {
    return NextResponse.json(
      { error: "Rate limiter unavailable, try again" },
      { status: 503 }
    );
  }
  if (rate === "limited") {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 3_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 10).map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json(
      { error: "Invalid request body", details },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const resolved = await resolveSession(supabase, keyInfo.userId, body);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  let session = resolved.session;

  // Lap regression = new race in the same open session; rotate to a fresh
  // session so the previous race's laps are preserved.
  const sessionLap = session.current_lap ?? 0;
  const batchMaxLap = maxOnTrackLap(body.points as IngestPoint[]);
  if (sessionLap >= 2 && batchMaxLap >= 1 && batchMaxLap < sessionLap) {
    const rotated = await rotateSession(supabase, keyInfo.userId, session, body);
    if (!rotated.ok) {
      return NextResponse.json({ error: rotated.error }, { status: rotated.status });
    }
    session = rotated.session;
  }

  // Backfill metadata the client didn't send when the session was created.
  // track_name in particular is what enables leaderboard writes.
  const metadataUpdate: Record<string, string | number> = {};
  if (body.track_name && session.track_name === null) {
    metadataUpdate.track_name = body.track_name;
  }
  if (body.car_name && session.car_name === null) {
    metadataUpdate.car_name = body.car_name;
  }
  if (body.car_code !== undefined && session.car_code === null) {
    metadataUpdate.car_code = body.car_code;
  }
  if (Object.keys(metadataUpdate).length > 0) {
    const { error } = await supabase
      .from("telemetry_sessions")
      .update(metadataUpdate)
      .eq("id", session.id);
    if (error) {
      console.error("ingest: session metadata backfill failed", error.message);
    }
    // Use the values for this batch's processing (leaderboard) either way.
    session = { ...session, ...metadataUpdate };
  }

  // Lap detection from the session's last known lap.
  const prevLap = session.current_lap ?? 0;
  const lapResult = processLapTransitions(prevLap, body.points as IngestPoint[]);

  const pointsToInsert = body.points.map((p, i) => ({
    session_id: session.id,
    packet_id: p.packet_id,
    pos_x: p.posX, pos_y: p.posY, pos_z: p.posZ,
    vel_x: p.velX, vel_y: p.velY, vel_z: p.velZ,
    rot_x: p.rotX, rot_y: p.rotY, rot_z: p.rotZ, rot_w: p.rotW,
    rpm: p.rpm, speed_ms: p.speed_ms, turbo_boost: p.turbo_boost,
    throttle: roundInt(p.throttle), brake: roundInt(p.brake),
    gear: roundInt(p.gear), suggested_gear: roundInt(p.suggested_gear),
    fuel_level: p.fuel_level, fuel_capacity: p.fuel_capacity,
    tire_temp_fl: p.tire_temp_fl, tire_temp_fr: p.tire_temp_fr,
    tire_temp_rl: p.tire_temp_rl, tire_temp_rr: p.tire_temp_rr,
    tire_radius_fl: p.tire_radius_fl, tire_radius_fr: p.tire_radius_fr,
    tire_radius_rl: p.tire_radius_rl, tire_radius_rr: p.tire_radius_rr,
    flags: roundInt(p.flags),
    lap_number: lapResult.pointLapNumbers[i],
  }));

  // Idempotent insert: retried batches hit the (session_id, packet_id)
  // unique index and are skipped.
  let pointsInserted = 0;
  for (let i = 0; i < pointsToInsert.length; i += CHUNK_SIZE) {
    const chunk = pointsToInsert.slice(i, i + CHUNK_SIZE);
    const { error, count } = await supabase
      .from("telemetry_points")
      .upsert(chunk, {
        onConflict: "session_id,packet_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) {
      console.error("ingest: failed to insert chunk", { offset: i, error: error.message });
      return NextResponse.json({ error: "Failed to ingest telemetry" }, { status: 500 });
    }
    pointsInserted += count ?? chunk.length;
  }

  if (pointsInserted === 0 && body.points.length >= 50) {
    // Likely a game relaunch that reset packet_id below this session's known
    // range, so every row collided on (session_id, packet_id). Observability
    // only — the lap-regression rotation above covers the new-race case.
    console.warn("ingest: large batch fully deduplicated", {
      session_id: session.id,
      points_received: body.points.length,
    });
  }

  // Finalize completed laps (idempotent on session_id, lap_number). Laps with
  // a real time may overwrite a placeholder; timeless laps must never clobber
  // an already-recorded real time (retried or out-of-order batches).
  if (lapResult.completedLaps.length > 0) {
    const toRow = (lap: CompletedLap) => ({
      session_id: session.id,
      lap_number: lap.lapNumber,
      lap_time_ms: lap.lapTimeMs ?? -1,
    });
    const timed = lapResult.completedLaps.filter(
      (lap) => lap.lapTimeMs !== null && lap.lapTimeMs > 0
    );
    const untimed = lapResult.completedLaps.filter(
      (lap) => lap.lapTimeMs === null || lap.lapTimeMs <= 0
    );
    if (timed.length > 0) {
      const { error } = await supabase
        .from("lap_data")
        .upsert(timed.map(toRow), { onConflict: "session_id,lap_number" });
      if (error) {
        console.error("ingest: lap_data upsert failed", error.message);
      }
    }
    if (untimed.length > 0) {
      const { error } = await supabase
        .from("lap_data")
        .upsert(untimed.map(toRow), {
          onConflict: "session_id,lap_number",
          ignoreDuplicates: true,
        });
      if (error) {
        console.error("ingest: lap_data placeholder insert failed", error.message);
      }
    }
  }

  // Session lifecycle update.
  const hasLapState = lapResult.pointLapNumbers.some((n) => n !== null);
  const sessionUpdate: Record<string, unknown> = {};
  if (hasLapState) {
    sessionUpdate.current_lap = lapResult.currentLap;
    sessionUpdate.total_laps = Math.max(
      session.total_laps ?? 0,
      lapResult.totalLaps ?? 0,
      lapResult.currentLap
    );
    if (lapResult.lastLapMs !== null) {
      sessionUpdate.last_lap_ms = lapResult.lastLapMs;
    }
    const knownBest = session.best_lap_ms ?? -1;
    const candidates = [knownBest, lapResult.bestLapMs ?? -1].filter((v) => v > 0);
    if (candidates.length > 0) {
      sessionUpdate.best_lap_ms = Math.min(...candidates);
    }
  }
  if (body.is_final) {
    sessionUpdate.ended_at = new Date().toISOString();
  }
  if (Object.keys(sessionUpdate).length > 0) {
    const { error } = await supabase
      .from("telemetry_sessions")
      .update(sessionUpdate)
      .eq("id", session.id);
    if (error) {
      console.error("ingest: session update failed", error.message);
    }
  }

  await maybeUpdateLeaderboard(supabase, keyInfo.userId, session, lapResult.completedLaps);

  await supabase
    .from("api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("id", keyInfo.keyId);

  return NextResponse.json({
    status: "ok",
    session_id: session.id,
    points_received: body.points.length,
    points_inserted: pointsInserted,
    laps_completed: lapResult.completedLaps.map((lap) => ({
      lap_number: lap.lapNumber,
      lap_time_ms: lap.lapTimeMs,
    })),
    current_lap: hasLapState ? lapResult.currentLap : prevLap,
  });
}
