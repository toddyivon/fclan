import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatLapTime } from "@/shared/telemetry";
import { cn } from "@/lib/utils";
import {
  LEADERBOARD_LIMIT_DEFAULT,
  getDriverStandings,
  getTrackLeaderboard,
  getTrackSummaries,
  rankColor,
} from "@/components/dashboard/leaderboard-widget";
import { TierBadge } from "@/components/shared/tier-badge";

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  return rtf.format(-months, "month");
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-card py-20 text-center text-muted-foreground">
      <Trophy className="mx-auto mb-4 h-12 w-12 opacity-30" />
      <p className="text-lg">No laps recorded yet — be the first</p>
      <p className="mt-2 text-sm">
        Finish a lap with the capture app and your best time shows up here.
      </p>
      <Button
        className="mt-6 bg-primary hover:bg-primary"
        render={<Link href="/dashboard" />}
      >
        Go to Dashboard
      </Button>
    </div>
  );
}

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const track =
    typeof sp.track === "string" && sp.track.trim() ? sp.track.trim() : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Track standings view (?track=...)
  if (track) {
    const board = await getTrackLeaderboard(
      supabase,
      user.id,
      track,
      LEADERBOARD_LIMIT_DEFAULT
    );
    const standings = await getDriverStandings(supabase);
    const tierByDriver = new Map(standings.map((s) => [s.driver_name, s.tier]));

    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/leaderboards"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            All tracks
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{track}</h1>
          <p className="text-muted-foreground mt-1">
            Community best laps — one entry per driver.
          </p>
        </div>

        {board.entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden grid-cols-[3rem_minmax(0,1.4fr)_7rem_minmax(0,1.2fr)_8rem] items-center gap-2 border-b border-border px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid">
              <span className="text-center">#</span>
              <span>Driver</span>
              <span className="text-right">Best Lap</span>
              <span>Car</span>
              <span>When</span>
            </div>
            <div className="divide-y divide-border">
              {board.entries.map((e) => {
                const isMe = board.me?.entryId === e.id;
                return (
                  <div
                    key={e.id}
                    className={cn(
                      "grid grid-cols-[2.5rem_minmax(0,1.5fr)_6.5rem] items-center gap-2 px-4 py-3 md:grid-cols-[3rem_minmax(0,1.4fr)_7rem_minmax(0,1.2fr)_8rem]",
                      isMe && "bg-primary/10"
                    )}
                  >
                    <span
                      className={cn(
                        "text-center font-mono text-sm tabular-nums",
                        e.rank <= 3 && "font-bold",
                        rankColor(e.rank)
                      )}
                    >
                      {e.rank}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{e.driver_name}</span>
                      {isMe && (
                        <Badge className="bg-primary/20 text-primary">You</Badge>
                      )}
                      <TierBadge tier={tierByDriver.get(e.driver_name) ?? null} />
                    </span>
                    <span className="text-right font-mono text-sm tabular-nums">
                      {formatLapTime(e.lap_time_ms)}
                    </span>
                    <span className="hidden truncate text-sm text-muted-foreground md:block">
                      {e.car_name ?? "—"}
                    </span>
                    <span className="hidden text-sm text-muted-foreground md:block">
                      {formatRelativeTime(e.achieved_at)}
                    </span>
                  </div>
                );
              })}
            </div>
            {board.me && board.me.rank > board.entries.length && (
              <div className="flex items-center justify-between gap-3 border-t border-border bg-primary/10 px-4 py-3 text-sm">
                <span>
                  Your best:{" "}
                  <span className="font-semibold text-primary">
                    #{board.me.rank}
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  {formatLapTime(board.me.lap_time_ms)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Track list view
  const tracks = await getTrackSummaries(supabase);
  const standings = await getDriverStandings(supabase);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Leaderboards</h1>
        <p className="text-muted-foreground mt-1">
          Community best laps per track. Pick a track to see the standings.
        </p>
      </div>

      {standings.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Driver standings</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="divide-y divide-border">
              {standings.slice(0, 10).map((s, i) => (
                <div
                  key={s.driver_name}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("w-6 text-center font-mono text-sm tabular-nums", rankColor(i + 1))}>
                      {i + 1}
                    </span>
                    <span className="truncate font-medium">{s.driver_name}</span>
                    <TierBadge tier={s.tier} />
                  </span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-mono tabular-nums text-foreground">{s.points} pts</span>
                    <span className="hidden sm:inline">
                      {s.wins}W · {s.podiums}P · {s.tracks} tracks
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tracks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => (
            <Link
              key={t.track_name}
              href={`/leaderboards?track=${encodeURIComponent(t.track_name)}`}
              className="group"
            >
              <Card className="transition-colors group-hover:bg-primary/5 group-hover:ring-primary/60">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      <Trophy className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{t.track_name}</span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {t.entries} driver{t.entries === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
