import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/env";
import { checkFeature } from "@/lib/billing/gate";

/**
 * GET /api/sessions/:id/export?format=csv|json (default csv)
 *
 * Pro/AI Premium only (telemetry_export gate) — free tier gets
 * 403 { error, upgrade: true }.
 *
 * Ownership is verified with the cookie-authed client (RLS); the full point
 * read uses the service-role client paginated with .range() in 1000-row
 * chunks (cap 200k) and is streamed via ReadableStream so we never build a
 * giant string in memory.
 */

const CHUNK_SIZE = 1000;
const MAX_EXPORT_POINTS = 200_000;

/** Every telemetry_points column except id/created_at. */
const EXPORT_COLUMNS = [
  "session_id",
  "packet_id",
  "timestamp",
  "pos_x", "pos_y", "pos_z",
  "vel_x", "vel_y", "vel_z",
  "rot_x", "rot_y", "rot_z", "rot_w",
  "rpm", "speed_ms", "turbo_boost",
  "throttle", "brake", "gear", "suggested_gear",
  "fuel_level", "fuel_capacity",
  "tire_temp_fl", "tire_temp_fr", "tire_temp_rl", "tire_temp_rr",
  "tire_radius_fl", "tire_radius_fr", "tire_radius_rl", "tire_radius_rr",
  "flags", "lap_number",
] as const;

type ExportRow = Record<string, unknown>;

function getServiceClient(): SupabaseClient {
  return createAdminClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(row: ExportRow): string {
  return EXPORT_COLUMNS.map((col) => csvCell(row[col])).join(",");
}

/** Fetches one .range() chunk of points ordered by packet_id. */
async function fetchChunk(
  service: SupabaseClient,
  sessionId: string,
  offset: number
): Promise<ExportRow[]> {
  const to = Math.min(offset + CHUNK_SIZE, MAX_EXPORT_POINTS) - 1;
  const { data, error } = await service
    .from("telemetry_points")
    .select(EXPORT_COLUMNS.join(", "))
    .eq("session_id", sessionId)
    .order("packet_id", { ascending: true })
    .range(offset, to);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExportRow[];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "json") {
    return NextResponse.json({ error: "format must be 'csv' or 'json'" }, { status: 400 });
  }

  // Ownership check with the user client (RLS-scoped).
  const { data: session } = await supabase
    .from("telemetry_sessions")
    .select(
      "id, user_id, car_name, car_code, track_name, started_at, ended_at, total_laps, best_lap_ms, current_lap, last_lap_ms"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { allowed } = await checkFeature(supabase, user.id, "telemetry_export");
  if (!allowed) {
    return NextResponse.json(
      { error: "Telemetry export requires the Pro plan", upgrade: true },
      { status: 403 }
    );
  }

  const service = getServiceClient();
  const encoder = new TextEncoder();
  let offset = 0;
  let finished = false;

  if (format === "csv") {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(EXPORT_COLUMNS.join(",") + "\n"));
      },
      async pull(controller) {
        if (finished) {
          controller.close();
          return;
        }
        try {
          const requested = Math.min(offset + CHUNK_SIZE, MAX_EXPORT_POINTS) - offset;
          const rows = await fetchChunk(service, id, offset);
          offset += rows.length;
          if (rows.length < requested || offset >= MAX_EXPORT_POINTS) finished = true;
          if (rows.length > 0) {
            controller.enqueue(encoder.encode(rows.map(csvLine).join("\n") + "\n"));
          }
          if (finished) controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gt7-session-${id}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // JSON: { session, laps, points } — laps read up-front (small), points streamed.
  const { data: laps, error: lapsError } = await supabase
    .from("lap_data")
    .select("lap_number, start_ms, end_ms, lap_time_ms")
    .eq("session_id", id)
    .order("lap_number", { ascending: true });
  if (lapsError) return NextResponse.json({ error: lapsError.message }, { status: 500 });

  let firstRow = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `{"session":${JSON.stringify(session)},"laps":${JSON.stringify(laps ?? [])},"points":[`
        )
      );
    },
    async pull(controller) {
      if (finished) {
        controller.close();
        return;
      }
      try {
        const requested = Math.min(offset + CHUNK_SIZE, MAX_EXPORT_POINTS) - offset;
        const rows = await fetchChunk(service, id, offset);
        offset += rows.length;
        if (rows.length < requested || offset >= MAX_EXPORT_POINTS) finished = true;
        if (rows.length > 0) {
          const prefix = firstRow ? "" : ",";
          firstRow = false;
          controller.enqueue(
            encoder.encode(prefix + rows.map((r) => JSON.stringify(r)).join(","))
          );
        }
        if (finished) {
          controller.enqueue(encoder.encode("]}"));
          controller.close();
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gt7-session-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
