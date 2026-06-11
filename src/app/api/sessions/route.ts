import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listSessions } from "@/components/sessions/query";

/**
 * GET /api/sessions — paginated list of the caller's telemetry sessions.
 * Query: page (1+), limit (<=50, default 20), track, car.
 * Ordered by started_at desc. Free tier is clamped to the last 7 days.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  try {
    const { sessions, page, total } = await listSessions(supabase, user.id, {
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
      track: sp.get("track") ?? undefined,
      car: sp.get("car") ?? undefined,
    });

    return NextResponse.json({ sessions, page, total });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list sessions" },
      { status: 500 }
    );
  }
}
