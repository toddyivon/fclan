import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkFeature, tierHasFeature } from "@/lib/billing/gate";
import { isLiveSession } from "@/components/sessions/query";
import { SessionCharts } from "@/components/sessions/charts";
import { LapsTable } from "@/components/sessions/laps-table";
import { SessionHeader } from "@/components/sessions/session-header";
import { TrackMap } from "@/components/sessions/track-map";
import { LapCompare } from "@/components/sessions/lap-compare";
import { GhostReplay } from "@/components/sessions/ghost-replay";
import { FuelStrategy } from "@/components/sessions/fuel-strategy";
import { ConsistencyCard } from "@/components/sessions/consistency-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLapTime } from "@/shared/telemetry";
import { Flag, Timer } from "lucide-react";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("telemetry_sessions")
    .select(
      "id, car_name, car_code, track_name, started_at, ended_at, total_laps, best_lap_ms, current_lap, last_lap_ms"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!session) notFound();

  const [{ data: laps }, { count: pointCount }, { allowed: canExport, tier }] =
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
      checkFeature(supabase, user.id, "telemetry_export"),
    ]);

  // Remaining gates derive from the tier checkFeature already resolved.
  const canTrackMap = tierHasFeature(tier, "track_map");
  const canCompare = tierHasFeature(tier, "lap_comparison");
  const canGhost = tierHasFeature(tier, "ghost_laps");
  const canFuel = tierHasFeature(tier, "fuel_strategy");

  const lapRows = laps ?? [];
  const completedLaps = lapRows.filter((l) => l.lap_time_ms != null && l.lap_time_ms > 0);
  const chartLaps = completedLaps.map((l) => ({
    lap_number: l.lap_number,
    lap_time_ms: l.lap_time_ms as number,
  }));
  const isLive = isLiveSession(session.started_at, session.ended_at);

  return (
    <div className="space-y-6">
      <SessionHeader session={session} isLive={isLive} canExport={canExport} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-violet-400" />
              Best Lap
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatLapTime(session.best_lap_ms)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5 text-violet-400" />
              Laps
            </CardDescription>
            <CardTitle className="text-2xl">{session.total_laps ?? completedLaps.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Lap</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatLapTime(session.last_lap_ms)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data Points</CardDescription>
            <CardTitle className="text-2xl">{(pointCount ?? 0).toLocaleString("en-US")}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts (client: fetches /api/sessions/:id/points?fields=full) */}
      <SessionCharts sessionId={session.id} laps={chartLaps} />

      {/* Advanced visualizations — gated server-side, locked cards otherwise */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TrackMap sessionId={session.id} laps={chartLaps} locked={!canTrackMap} />
        <LapCompare sessionId={session.id} laps={chartLaps} locked={!canCompare} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GhostReplay sessionId={session.id} laps={chartLaps} locked={!canGhost} />
        <FuelStrategy sessionId={session.id} laps={chartLaps} locked={!canFuel} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LapsTable laps={lapRows} />
        <ConsistencyCard laps={chartLaps} locked={!canCompare} />
      </div>
    </div>
  );
}
