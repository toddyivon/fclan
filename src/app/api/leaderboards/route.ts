import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clampLeaderboardLimit,
  getTrackLeaderboard,
  getTrackSummaries,
} from "@/components/dashboard/leaderboard-widget";

/**
 * GET /api/leaderboards — community best-lap standings.
 *
 * Without `track`: `{ tracks: [{ track_name, entries }] }` — distinct tracks
 * from the `leaderboard_public` view, most entries first (max 100).
 *
 * With `track` (+ optional `limit`, default 50, max 100):
 * `{ track, entries: [{ rank, driver_name, car_name, lap_time_ms, lap_number,
 * achieved_at }], me: { rank, lap_time_ms } | null }`.
 *
 * Cookie-authed; reads go through the user client (view is GRANTed to
 * `authenticated`, base-table RLS allows authenticated SELECT).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const track = sp.get("track")?.trim();

  try {
    if (!track) {
      const tracks = await getTrackSummaries(supabase);
      return NextResponse.json({ tracks });
    }

    const limit = clampLeaderboardLimit(sp.get("limit"));
    const { entries, me } = await getTrackLeaderboard(supabase, user.id, track, limit);

    return NextResponse.json({
      track,
      entries: entries.map(
        ({ rank, driver_name, car_name, lap_time_ms, lap_number, achieved_at }) => ({
          rank,
          driver_name,
          car_name,
          lap_time_ms,
          lap_number,
          achieved_at,
        })
      ),
      me: me ? { rank: me.rank, lap_time_ms: me.lap_time_ms } : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load leaderboards" },
      { status: 500 }
    );
  }
}
