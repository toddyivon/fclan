import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserTier } from "@/lib/billing/gate";
import type { Tier } from "@/lib/billing/quota";

/**
 * Shared session-list query used by both GET /api/sessions and the
 * /sessions server page so filtering/tier rules can't drift apart.
 * Server-side only (expects a cookie-authed Supabase client; RLS applies).
 */

export const SESSIONS_PAGE_LIMIT_DEFAULT = 20;
export const SESSIONS_PAGE_LIMIT_MAX = 50;
export const FREE_TIER_HISTORY_DAYS = 7;

export interface SessionListItem {
  id: string;
  car_name: string | null;
  track_name: string | null;
  started_at: string;
  ended_at: string | null;
  total_laps: number | null;
  best_lap_ms: number | null;
  current_lap: number | null;
}

export interface ListSessionsParams {
  page?: number | string;
  limit?: number | string;
  track?: string;
  car?: string;
}

export interface ListSessionsResult {
  sessions: SessionListItem[];
  page: number;
  limit: number;
  total: number;
  tier: Tier;
}

export const LIVE_WINDOW_MS = 10 * 60 * 1000;

/** A session counts as live when it never ended and started < 10 min ago. */
export function isLiveSession(startedAt: string, endedAt: string | null): boolean {
  return endedAt === null && Date.now() - new Date(startedAt).getTime() < LIVE_WINDOW_MS;
}

export function clampPage(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function clampLimit(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return SESSIONS_PAGE_LIMIT_DEFAULT;
  return Math.min(Math.floor(n), SESSIONS_PAGE_LIMIT_MAX);
}

export async function listSessions(
  supabase: SupabaseClient,
  userId: string,
  params: ListSessionsParams = {}
): Promise<ListSessionsResult> {
  const page = clampPage(params.page);
  const limit = clampLimit(params.limit);
  const from = (page - 1) * limit;

  const tier = await getUserTier(supabase, userId);

  let query = supabase
    .from("telemetry_sessions")
    .select(
      "id, car_name, track_name, started_at, ended_at, total_laps, best_lap_ms, current_lap",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .range(from, from + limit - 1);

  if (params.track?.trim()) query = query.ilike("track_name", `%${params.track.trim()}%`);
  if (params.car?.trim()) query = query.ilike("car_name", `%${params.car.trim()}%`);

  // Free tier only keeps the trailing 7 days of history.
  if (tier === "free") {
    const cutoff = new Date(Date.now() - FREE_TIER_HISTORY_DAYS * 24 * 60 * 60 * 1000);
    query = query.gte("started_at", cutoff.toISOString());
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    sessions: (data ?? []) as SessionListItem[],
    page,
    limit,
    total: count ?? 0,
    tier,
  };
}
