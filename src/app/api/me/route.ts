import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuota } from "@/lib/billing/quota";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // All reads use the cookie-authed client; RLS scopes them to the caller's rows.
  const [{ data: profile }, quota, { data: subscription }] = await Promise.all([
    supabase.from("users").select("id, email, name, tier, role").eq("id", user.id).single(),
    getQuota(supabase, user.id),
    supabase
      .from("stripe_subscriptions")
      .select("status, price_id, current_period_end")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      tier: profile.tier,
      role: profile.role,
    },
    quota: quota
      ? {
          ai_analyses_used: quota.ai_analyses_used,
          ai_analyses_limit: quota.ai_analyses_limit,
          api_keys_used: quota.api_keys_used,
          api_keys_limit: quota.api_keys_limit,
          quota_reset_at: quota.quota_reset_at,
        }
      : null,
    subscription: subscription
      ? {
          status: subscription.status,
          price_id: subscription.price_id,
          current_period_end: subscription.current_period_end,
        }
      : null,
  });
}
