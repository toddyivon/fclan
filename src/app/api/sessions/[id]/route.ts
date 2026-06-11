import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/sessions/:id — session detail + ordered laps + point count.
 * 404 when the session doesn't exist or isn't owned by the caller (RLS).
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session } = await supabase
    .from("telemetry_sessions")
    .select(
      "id, car_name, car_code, track_name, started_at, ended_at, total_laps, best_lap_ms, current_lap, last_lap_ms"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: laps, error: lapsError }, { count: pointCount, error: countError }] =
    await Promise.all([
      supabase
        .from("lap_data")
        .select("lap_number, start_ms, end_ms, lap_time_ms")
        .eq("session_id", id)
        .order("lap_number", { ascending: true }),
      supabase
        .from("telemetry_points")
        .select("id", { count: "exact", head: true })
        .eq("session_id", id),
    ]);

  if (lapsError || countError) {
    return NextResponse.json(
      { error: lapsError?.message ?? countError?.message ?? "Query failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ session, laps: laps ?? [], pointCount: pointCount ?? 0 });
}

/**
 * DELETE /api/sessions/:id — deletes the caller's own session (RLS delete
 * policy + ON DELETE CASCADE clean up points/laps/analyses). 204 on success.
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session } = await supabase
    .from("telemetry_sessions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("telemetry_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
