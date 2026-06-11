import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

function getServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("api_keys")
    .select("id, name, created_at, last_used")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "Unnamed Key";

  const service = getServiceClient();

  const raw = `gt7_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(raw).digest("hex");

  // Atomic create: the RPC locks the quota row, counts REAL keys and only
  // inserts under the tier limit — concurrent requests cannot oversubscribe.
  const { data: result, error } = await service.rpc("create_api_key", {
    p_user_id: user.id,
    p_key_hash: keyHash,
    p_name: name,
  });

  if (error) {
    console.error("keys: create_api_key rpc failed", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
  if (!result?.ok) {
    if (result?.reason === "limit_reached") {
      return NextResponse.json({ error: "API key limit reached for your tier" }, { status: 403 });
    }
    return NextResponse.json({ error: "No quota record" }, { status: 500 });
  }

  return NextResponse.json(
    { key: { id: result.id, name: result.name, created_at: result.created_at, plaintext: raw } },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const service = getServiceClient();
  const { data: existing } = await service
    .from("api_keys")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await service.from("api_keys").delete().eq("id", id);

  // Recount real keys atomically (cached counters drift under concurrency).
  const { error: refreshError } = await service.rpc("refresh_api_key_count", {
    p_user_id: user.id,
  });
  if (refreshError) {
    console.error("keys: refresh_api_key_count failed", refreshError);
  }

  return NextResponse.json({ ok: true });
}
