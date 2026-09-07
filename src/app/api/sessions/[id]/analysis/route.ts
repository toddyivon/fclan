import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readSessionPoints, ANALYSIS_COLUMNS } from "@/lib/session-points";
import { adaptPoints, groupByLap } from "@/lib/analysis/adapter";
import { buildAnalysisBundle } from "@/lib/analysis/bundle";

/**
 * GET /api/sessions/:id/analysis
 *
 * The live product path for every harvested analysis engine (Stage 3):
 *  - lap comparison (distance-normalized delta, best vs last)
 *  - corner detection + brake zones on the best lap
 *  - fuel strategy + relative fuel-map simulation
 *  - consistency variance + median reference lap
 *
 * Auth: session must belong to the caller (same gate as /points).
 * Performance: reuses the shared points reader; engines run on the
 * downsampled-to-2000 row set for interactive latency (the full-fidelity
 * charts keep using /points directly).
 */

const MAX_ANALYSIS_ROWS = 2000;

function downsampleRows<T>(rows: T[], target: number): T[] {
  if (rows.length <= target) return rows;
  const step = rows.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) out.push(rows[Math.floor(i * step)]);
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session } = await supabase
    .from("telemetry_sessions")
    .select("id, current_lap, total_laps")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: laps } = await supabase
    .from("lap_data")
    .select("lap_number, lap_time_ms")
    .eq("session_id", id)
    .order("lap_number", { ascending: true });

  const { rows, error } = await readSessionPoints(supabase, id, ANALYSIS_COLUMNS, null);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const sampled = downsampleRows(rows, MAX_ANALYSIS_ROWS);
  const adapted = adaptPoints(sampled);
  const byLap = groupByLap(adapted);

  const lapRows = (laps ?? []) as Array<{ lap_number: number; lap_time_ms: number | null }>;
  const inputs = lapRows
    .map((l) => ({
      lapNumber: l.lap_number,
      lapTimeMs: l.lap_time_ms,
      points: byLap.get(l.lap_number) ?? [],
    }))
    .filter((l) => l.points.length >= 2);

  const maxLapInPoints = [...byLap.keys()].reduce((a, b) => Math.max(a, b), 0);
  const bundle = buildAnalysisBundle(inputs, {
    currentLap: session.current_lap ?? maxLapInPoints,
    totalLaps: session.total_laps ?? 0,
  });

  return NextResponse.json({
    ...bundle,
    meta: { pointsScanned: rows.length, pointsSampled: sampled.length },
  });
}
