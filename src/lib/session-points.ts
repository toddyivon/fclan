import type { SupabaseClient } from "@supabase/supabase-js";
import type { FclanPointRow } from "@/lib/analysis/adapter";

/**
 * Shared telemetry_points reader. Pages through PostgREST in 1000-row
 * chunks (its silent truncation limit) with a 100k safety cap, ordered by
 * packet_id. Callers own auth (session-ownership check first).
 *
 * Used by both /api/sessions/[id]/points (raw rows) and
 * /api/sessions/[id]/analysis (engine input) so the two can never drift.
 */

export const POINTS_CHUNK_SIZE = 1000;
export const POINTS_SCAN_CAP = 100_000;

export async function readSessionPoints(
  supabase: SupabaseClient,
  sessionId: string,
  columns: string,
  lap: number | null
): Promise<{ rows: FclanPointRow[]; error: string | null }> {
  const all: FclanPointRow[] = [];
  for (let from = 0; from < POINTS_SCAN_CAP; from += POINTS_CHUNK_SIZE) {
    const to = Math.min(from + POINTS_CHUNK_SIZE, POINTS_SCAN_CAP) - 1;
    let query = supabase
      .from("telemetry_points")
      .select(columns)
      .eq("session_id", sessionId)
      .order("packet_id", { ascending: true })
      .range(from, to);
    if (lap !== null) query = query.eq("lap_number", lap);

    const { data, error } = await query;
    if (error) return { rows: all, error: error.message };

    const rows = (data ?? []) as unknown as FclanPointRow[];
    all.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return { rows: all, error: null };
}

export const ANALYSIS_COLUMNS = [
  "packet_id",
  "lap_number",
  "speed_ms",
  "rpm",
  "throttle",
  "brake",
  "gear",
  "pos_x",
  "pos_z",
  "tire_temp_fl",
  "tire_temp_fr",
  "tire_temp_rl",
  "tire_temp_rr",
  "fuel_level",
  "fuel_capacity",
].join(", ");
