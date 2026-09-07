import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatLapTime } from "@/shared/telemetry";
import { cn } from "@/lib/utils";

/**
 * Community leaderboard queries shared by GET /api/leaderboards, the
 * /leaderboards page and the dashboard widget so ranking rules can't drift.
 * Server-side only — expects a cookie-authed Supabase client. The
 * `leaderboard_public` view is SELECT-granted to `authenticated`, and
 * `leaderboard_entries` RLS lets any authenticated user read all rows.
 */

export const LEADERBOARD_LIMIT_DEFAULT = 50;
export const LEADERBOARD_LIMIT_MAX = 100;
export const LEADERBOARD_TRACKS_MAX = 100;

export interface TrackSummary {
  track_name: string;
  entries: number;
}

export interface LeaderboardRow {
  rank: number;
  id: string;
  driver_name: string;
  car_name: string | null;
  lap_time_ms: number;
  lap_number: number | null;
  achieved_at: string;
}

export interface TrackLeaderboard {
  track: string;
  entries: LeaderboardRow[];
  /** Caller's own entry on this track (entryId matches LeaderboardRow.id). */
  me: { rank: number; lap_time_ms: number; entryId: string } | null;
}

export function clampLeaderboardLimit(raw: string | null | undefined): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return LEADERBOARD_LIMIT_DEFAULT;
  return Math.min(Math.floor(n), LEADERBOARD_LIMIT_MAX);
}

/** Tailwind text color for a rank: gold / silver / bronze for the podium. */
export function rankColor(rank: number): string {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-amber-600";
  return "text-muted-foreground";
}

/** Distinct tracks with entry counts, most active first (max `max` tracks). */
export async function getTrackSummaries(
  supabase: SupabaseClient,
  max: number = LEADERBOARD_TRACKS_MAX
): Promise<TrackSummary[]> {
  const { data, error } = await supabase
    .from("leaderboard_public")
    .select("track_name")
    .limit(10_000);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { track_name: string }[]) {
    counts.set(row.track_name, (counts.get(row.track_name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([track_name, entries]) => ({ track_name, entries }))
    .sort((a, b) => b.entries - a.entries || a.track_name.localeCompare(b.track_name))
    .slice(0, max);
}

/** Ranked standings for one track plus the caller's own position (if any). */
export async function getTrackLeaderboard(
  supabase: SupabaseClient,
  userId: string,
  track: string,
  limit: number = LEADERBOARD_LIMIT_DEFAULT
): Promise<TrackLeaderboard> {
  const { data, error } = await supabase
    .from("leaderboard_public")
    .select("id, driver_name, car_name, lap_time_ms, lap_number, achieved_at")
    .eq("track_name", track)
    .order("lap_time_ms", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const entries: LeaderboardRow[] = (
    (data ?? []) as Omit<LeaderboardRow, "rank">[]
  ).map((row, i) => ({ rank: i + 1, ...row }));

  // Own entry comes from the base table (only place user_id is exposed).
  const { data: mine, error: mineError } = await supabase
    .from("leaderboard_entries")
    .select("id, lap_time_ms")
    .eq("user_id", userId)
    .eq("track_name", track)
    .maybeSingle();
  if (mineError) throw new Error(mineError.message);

  let me: TrackLeaderboard["me"] = null;
  if (mine) {
    const inList = entries.find((e) => e.id === mine.id);
    if (inList) {
      me = { rank: inList.rank, lap_time_ms: inList.lap_time_ms, entryId: mine.id };
    } else {
      // Outside the fetched window — rank = faster entries + 1.
      const { count, error: countError } = await supabase
        .from("leaderboard_public")
        .select("id", { count: "exact", head: true })
        .eq("track_name", track)
        .lt("lap_time_ms", mine.lap_time_ms);
      if (countError) throw new Error(countError.message);
      me = { rank: (count ?? 0) + 1, lap_time_ms: mine.lap_time_ms, entryId: mine.id };
    }
  }

  return { track, entries, me };
}

/** Dashboard widget: top 5 of the most active track + caller's position. */
export async function LeaderboardWidget({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [topTrack] = await getTrackSummaries(supabase, 1);
  const board = topTrack
    ? await getTrackLeaderboard(supabase, userId, topTrack.track_name, 5)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-violet-400" />
          Community Leaderboard
        </CardTitle>
        <CardDescription>
          {topTrack
            ? `${topTrack.track_name} · ${topTrack.entries} driver${topTrack.entries === 1 ? "" : "s"}`
            : "Fastest laps across the community."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!board || board.entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No community laps yet</p>
            <p className="text-xs mt-1">Set a lap time to claim the first spot</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {board.entries.map((e) => {
              const isMe = board.me?.entryId === e.id;
              return (
                <div
                  key={e.id}
                  className={cn(
                    "-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5",
                    isMe && "bg-violet-600/10"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "w-5 shrink-0 text-center font-mono text-sm font-bold tabular-nums",
                        rankColor(e.rank)
                      )}
                    >
                      {e.rank}
                    </span>
                    <span className="truncate text-sm font-medium">{e.driver_name}</span>
                    {isMe && (
                      <Badge className="bg-violet-600/20 text-violet-300">You</Badge>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {formatLapTime(e.lap_time_ms)}
                  </span>
                </div>
              );
            })}
            {board.me && board.me.rank > board.entries.length && (
              <div className="-mx-2 flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
                <span className="text-muted-foreground">
                  Your best:{" "}
                  <span className="font-semibold text-violet-300">#{board.me.rank}</span>
                </span>
                <span className="font-mono tabular-nums">
                  {formatLapTime(board.me.lap_time_ms)}
                </span>
              </div>
            )}
          </div>
        )}
        <Link
          href="/leaderboards"
          className="block pt-3 text-center text-xs text-violet-400 transition-colors hover:text-violet-300"
        >
          View leaderboards
        </Link>
      </CardContent>
    </Card>
  );
}
