import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/** Requester must be authenticated AND have users.role === 'admin' (read via RLS-scoped client). */
async function requireAdmin(): Promise<AdminCheck> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const service = getServiceClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();

  const [
    usersTotal,
    usersFree,
    usersPro,
    usersAiPremium,
    sessionsTotal,
    sessionsLast7d,
    pointsTotal,
    analysesLast30d,
    subsActive,
  ] = await Promise.all([
    service.from("users").select("*", { count: "exact", head: true }),
    service.from("users").select("*", { count: "exact", head: true }).eq("tier", "free"),
    service.from("users").select("*", { count: "exact", head: true }).eq("tier", "pro"),
    service.from("users").select("*", { count: "exact", head: true }).eq("tier", "ai_premium"),
    service.from("telemetry_sessions").select("*", { count: "exact", head: true }),
    service
      .from("telemetry_sessions")
      .select("*", { count: "exact", head: true })
      .gte("started_at", sevenDaysAgo),
    service.from("telemetry_points").select("*", { count: "exact", head: true }),
    service
      .from("ai_analyses")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),
    service
      .from("stripe_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const failed = [
    usersTotal,
    usersFree,
    usersPro,
    usersAiPremium,
    sessionsTotal,
    sessionsLast7d,
    pointsTotal,
    analysesLast30d,
    subsActive,
  ].find((r) => r.error);
  if (failed?.error) {
    console.error("[admin/stats] count query failed:", failed.error.message);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

  return NextResponse.json({
    users: {
      total: usersTotal.count ?? 0,
      by_tier: {
        free: usersFree.count ?? 0,
        pro: usersPro.count ?? 0,
        ai_premium: usersAiPremium.count ?? 0,
      },
    },
    sessions: {
      total: sessionsTotal.count ?? 0,
      last_7d: sessionsLast7d.count ?? 0,
    },
    points: { total: pointsTotal.count ?? 0 },
    analyses: { last_30d: analysesLast30d.count ?? 0 },
    subscriptions: { active: subsActive.count ?? 0 },
  });
}
