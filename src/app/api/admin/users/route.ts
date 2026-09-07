import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { serverEnv } from "@/env";

const PAGE_SIZE = 50;
const TIERS = ["free", "pro", "ai_premium"] as const;
const ROLES = ["user", "admin"] as const;

type Tier = (typeof TIERS)[number];
type Role = (typeof ROLES)[number];

function getServiceClient() {
  return createAdminClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
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

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const params = req.nextUrl.searchParams;
  const search = params.get("search")?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const service = getServiceClient();
  let query = service
    .from("users")
    .select("id, email, name, tier, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (search) {
    // Escape ilike wildcards so the search is a literal substring match.
    const escaped = search.replace(/[\\%_]/g, (c) => `\\${c}`);
    query = query.ilike("email", `%${escaped}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error("[admin/users] list query failed:", error.message);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }

  return NextResponse.json({
    users: data ?? [],
    page,
    total: count ?? 0,
    page_size: PAGE_SIZE,
  });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const tier = body?.tier as string | undefined;
  const role = body?.role as string | undefined;

  if (tier === undefined && role === undefined) {
    return NextResponse.json({ error: "Provide tier and/or role to update" }, { status: 400 });
  }
  if (tier !== undefined && !(TIERS as readonly string[]).includes(tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  if (role !== undefined && !(ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  // Lockout guard: an admin can never demote their own role.
  if (role !== undefined && userId === gate.userId && role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin role" },
      { status: 400 }
    );
  }

  const update: { tier?: Tier; role?: Role } = {};
  if (tier !== undefined) update.tier = tier as Tier;
  if (role !== undefined) update.role = role as Role;

  const service = getServiceClient();
  const { data: updated, error } = await service
    .from("users")
    .update(update)
    .eq("id", userId)
    .select("id, email, name, tier, role, created_at")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "User not found or update failed" }, { status: 404 });
  }

  // Audit trail (server logs).
  console.info(
    `[admin-audit] admin=${gate.userId} updated user=${userId} changes=${JSON.stringify(update)} at=${new Date().toISOString()}`
  );

  return NextResponse.json({ user: updated });
}
