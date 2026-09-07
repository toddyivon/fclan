import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { serverEnv } from "@/env";

/**
 * POST   /api/share        — create (or reuse) a public share link for a lap.
 * DELETE /api/share?id=... — revoke a share link (soft delete via revoked_at).
 *
 * Reads/inserts go through the cookie-authed user client so shared_laps RLS
 * (insert/select own rows only) does the ownership enforcement. The revoke
 * UPDATE uses the service-role client because shared_laps deliberately has no
 * UPDATE policy — ownership is verified with the user client first.
 */

function getServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const sessionId = body.session_id;
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  let lapNumber: number | null = null;
  if (body.lap_number !== undefined && body.lap_number !== null) {
    lapNumber = Number(body.lap_number);
    if (!Number.isInteger(lapNumber) || lapNumber < 0) {
      return NextResponse.json(
        { error: "lap_number must be a non-negative integer" },
        { status: 400 }
      );
    }
  }

  // Ownership check via the user client (RLS scopes to own rows).
  const { data: session } = await supabase
    .from("telemetry_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const baseUrl = serverEnv.APP_URL ?? req.nextUrl.origin;

  // Light idempotency: reuse an existing non-revoked share for (session, lap).
  let existingQuery = supabase
    .from("shared_laps")
    .select("token")
    .eq("session_id", sessionId)
    .eq("created_by", user.id)
    .is("revoked_at", null)
    .limit(1);
  existingQuery =
    lapNumber === null
      ? existingQuery.is("lap_number", null)
      : existingQuery.eq("lap_number", lapNumber);
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    return NextResponse.json({
      token: existing.token,
      url: `${baseUrl}/share/${existing.token}`,
    });
  }

  const token = randomBytes(12).toString("base64url");

  const { data: inserted, error } = await supabase
    .from("shared_laps")
    .insert({
      token,
      session_id: sessionId,
      lap_number: lapNumber,
      created_by: user.id,
    })
    .select("token")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }

  return NextResponse.json(
    { token: inserted.token, url: `${baseUrl}/share/${inserted.token}` },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Ownership check via RLS-scoped select; only then revoke with service role
  // (shared_laps has no UPDATE policy by design).
  const { data: share } = await supabase
    .from("shared_laps")
    .select("id, revoked_at")
    .eq("id", id)
    .eq("created_by", user.id)
    .maybeSingle();
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!share.revoked_at) {
    const service = getServiceClient();
    const { error } = await service
      .from("shared_laps")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Failed to revoke share link" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
