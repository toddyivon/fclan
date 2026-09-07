import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, ChevronRight, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatLapTime } from "@/shared/telemetry";
import { LiveTelemetry } from "@/components/dashboard/live-telemetry";
import { LeaderboardWidget } from "@/components/dashboard/leaderboard-widget";

const ACTIVE_SESSION_WINDOW_MS = 4 * 60 * 60 * 1000;

interface SessionRow {
  id: string;
  car_name: string | null;
  track_name: string | null;
  started_at: string;
  ended_at: string | null;
  total_laps: number | null;
  best_lap_ms: number | null;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** ISO timestamp 4h ago — sessions opened before this are considered stale. */
function activeCutoffIso(): string {
  return new Date(Date.now() - ACTIVE_SESSION_WINDOW_MS).toISOString();
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeCutoff = activeCutoffIso();

  const [sessionCountRes, bestLapRes, carsRes, quotaRes, recentRes, activeRes] =
    await Promise.all([
      supabase
        .from("telemetry_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("telemetry_sessions")
        .select("best_lap_ms")
        .eq("user_id", user.id)
        .gt("best_lap_ms", 0)
        .order("best_lap_ms", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("telemetry_sessions")
        .select("car_name")
        .eq("user_id", user.id)
        .not("car_name", "is", null),
      supabase
        .from("user_quotas")
        .select("ai_analyses_used, ai_analyses_limit")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("telemetry_sessions")
        .select("id, car_name, track_name, started_at, ended_at, total_laps, best_lap_ms")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("telemetry_sessions")
        .select("id, car_name, track_name")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .gt("started_at", activeCutoff)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const totalSessions = sessionCountRes.count ?? 0;
  const bestLapMs: number | null = bestLapRes.data?.best_lap_ms ?? null;
  const carsDriven = new Set(
    ((carsRes.data ?? []) as { car_name: string | null }[])
      .map((r) => r.car_name)
      .filter(Boolean)
  ).size;
  const aiUsed = quotaRes.data?.ai_analyses_used ?? 0;
  const aiLimit = quotaRes.data?.ai_analyses_limit ?? 0;
  const recentSessions = (recentRes.data ?? []) as SessionRow[];
  const activeSession = activeRes.data ?? null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor your GT7 telemetry and analyze your laps.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Sessions</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{totalSessions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Best Lap</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums">
              {formatLapTime(bestLapMs)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cars Driven</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{carsDriven}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI Analyses This Month</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {aiUsed}
              {aiLimit > 0 && aiLimit < 999_999 && (
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / {aiLimit}
                </span>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Live telemetry + Recent sessions */}
      <div className="grid md:grid-cols-2 gap-6 items-start">
        <LiveTelemetry userId={user.id} initialSession={activeSession} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Recent Sessions
            </CardTitle>
            <CardDescription>Your latest driving sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Car className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No sessions yet</p>
                <p className="text-xs mt-1">Start your first capture to see data</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentSessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-primary/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {s.car_name ?? "Unknown car"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.track_name ?? "Unknown track"} ·{" "}
                        {dateFmt.format(new Date(s.started_at))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {!s.ended_at && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                        >
                          LIVE
                        </Badge>
                      )}
                      <div className="text-right">
                        <p className="font-mono text-sm tabular-nums">
                          {formatLapTime(s.best_lap_ms)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.total_laps ?? 0} laps
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                    </div>
                  </Link>
                ))}
                <Link
                  href="/sessions"
                  className="block pt-3 text-center text-xs text-primary transition-colors hover:text-primary"
                >
                  View all sessions
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <LeaderboardWidget userId={user.id} />
      </div>
    </div>
  );
}
