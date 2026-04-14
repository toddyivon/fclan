import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_POINTS_RETURNED = 2000;

interface PointRow {
  packet_id: number;
  speed_ms: number | null;
  rpm: number | null;
  throttle: number | null;
  brake: number | null;
  gear: number | null;
}

function downsample(rows: PointRow[], target: number): PointRow[] {
  if (rows.length <= target) return rows;
  const bucketSize = Math.ceil(rows.length / target);
  const out: PointRow[] = [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const bucket = rows.slice(i, i + bucketSize);
    let sumSpeed = 0, sumRpm = 0, sumThrottle = 0, sumBrake = 0, sumGear = 0;
    for (const r of bucket) {
      sumSpeed += r.speed_ms ?? 0;
      sumRpm += r.rpm ?? 0;
      sumThrottle += r.throttle ?? 0;
      sumBrake += r.brake ?? 0;
      sumGear += r.gear ?? 0;
    }
    const n = bucket.length;
    out.push({
      packet_id: bucket[0].packet_id,
      speed_ms: sumSpeed / n,
      rpm: sumRpm / n,
      throttle: sumThrottle / n,
      brake: sumBrake / n,
      gear: Math.round(sumGear / n),
    });
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

  const { data, error } = await supabase
    .from("telemetry_points")
    .select("packet_id, speed_ms, rpm, throttle, brake, gear")
    .eq("session_id", id)
    .order("packet_id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reduced = downsample((data ?? []) as PointRow[], MAX_POINTS_RETURNED);
  return NextResponse.json({ points: reduced, total: data?.length ?? 0, sampled: reduced.length });
}
