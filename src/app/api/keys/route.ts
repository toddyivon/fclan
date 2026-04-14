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

  const { data: quota } = await service
    .from("user_quotas")
    .select("api_keys_used, api_keys_limit")
    .eq("user_id", user.id)
    .single();

  if (!quota) {
    return NextResponse.json({ error: "No quota record" }, { status: 500 });
  }
  if (quota.api_keys_used >= quota.api_keys_limit) {
    return NextResponse.json({ error: "API key limit reached for your tier" }, { status: 403 });
  }

  const raw = `gt7_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(raw).digest("hex");

  const { data: inserted, error } = await service
    .from("api_keys")
    .insert({ user_id: user.id, key_hash: keyHash, name })
    .select("id, name, created_at")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }

  await service
    .from("user_quotas")
    .update({ api_keys_used: quota.api_keys_used + 1 })
    .eq("user_id", user.id);

  return NextResponse.json({ key: { ...inserted, plaintext: raw } }, { status: 201 });
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

  const { data: quota } = await service
    .from("user_quotas")
    .select("api_keys_used")
    .eq("user_id", user.id)
    .single();
  if (quota) {
    await service
      .from("user_quotas")
      .update({ api_keys_used: Math.max(0, quota.api_keys_used - 1) })
      .eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true });
}
