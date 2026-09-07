import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readSessionPoints } from "@/lib/session-points";

/**
 * GET /api/sessions/:id/points
 * Query:
 *   - lap=N        only points of that lap_number
 *   - fields=basic (default) packet_id,speed_ms,rpm,throttle,brake,gear,lap_number
 *   - fields=full  basic + pos_x,pos_z,tire_temp_fl/fr/rl/rr,fuel_level
 *
 * PostgREST silently truncates un-limited selects at 1000 rows, so we page
 * server-side with .range() in 1000-row chunks (safety cap 100k) before
 * downsampling to at most 2000 points.
 */

const MAX_POINTS_RETURNED = 2000;

const BASIC_FIELDS = [
  "packet_id",
  "speed_ms",
  "rpm",
  "throttle",
  "brake",
  "gear",
  "lap_number",
] as const;

const FULL_FIELDS = [
  ...BASIC_FIELDS,
  "pos_x",
  "pos_z",
  "tire_temp_fl",
  "tire_temp_fr",
  "tire_temp_rl",
  "tire_temp_rr",
  "fuel_level",
] as const;

type PointRow = { packet_id: number } & Record<string, number | null>;

/**
 * Bucket-averages rows down to at most `target` points. packet_id and
 * lap_number are taken from the first row of each bucket; gear is rounded;
 * every other numeric field is the bucket average (nulls skipped).
 */
function downsample(rows: PointRow[], target: number): PointRow[] {
  if (rows.length <= target) return rows;
  const bucketSize = Math.ceil(rows.length / target);
  const avgKeys = Object.keys(rows[0]).filter(
    (k) => k !== "packet_id" && k !== "lap_number"
  );
  const out: PointRow[] = [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const bucket = rows.slice(i, i + bucketSize);
    const row: PointRow = { packet_id: bucket[0].packet_id };
    if ("lap_number" in bucket[0]) row.lap_number = bucket[0].lap_number;
    for (const key of avgKeys) {
      let sum = 0;
      let n = 0;
      for (const r of bucket) {
        const v = r[key];
        if (v != null) {
          sum += v;
          n++;
        }
      }
      row[key] = n === 0 ? null : key === "gear" ? Math.round(sum / n) : sum / n;
    }
    out.push(row);
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const sp = req.nextUrl.searchParams;

  const fieldsParam = sp.get("fields") ?? "basic";
  if (fieldsParam !== "basic" && fieldsParam !== "full") {
    return NextResponse.json({ error: "fields must be 'basic' or 'full'" }, { status: 400 });
  }
  const columns = (fieldsParam === "full" ? FULL_FIELDS : BASIC_FIELDS).join(", ");

  const lapParam = sp.get("lap");
  let lap: number | null = null;
  if (lapParam !== null) {
    lap = parseInt(lapParam, 10);
    if (!Number.isFinite(lap) || lap < 0) {
      return NextResponse.json({ error: "lap must be a non-negative integer" }, { status: 400 });
    }
  }

  // Page through PostgREST in 1000-row chunks until exhausted (or cap hit).
  const { rows: all, error } = await readSessionPoints(supabase, id, columns, lap);
  if (error) return NextResponse.json({ error }, { status: 500 });

  // Sound: every FclanPointRow value is number|null (DB numerics), which is
  // exactly what downsample averages. The cast keeps the row type strict
  // everywhere else (adapter, analysis route).
  const reduced = downsample(all as unknown as PointRow[], MAX_POINTS_RETURNED);
  return NextResponse.json({ points: reduced, total: all.length, sampled: reduced.length });
}
