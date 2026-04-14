import type { SupabaseClient } from "@supabase/supabase-js";

export type Tier = "free" | "pro" | "ai_premium";

export interface Quota {
  tier: Tier;
  api_keys_used: number;
  api_keys_limit: number;
  ai_analyses_used: number;
  ai_analyses_limit: number;
  quota_reset_at: string;
}

export async function getQuota(supabase: SupabaseClient, userId: string): Promise<Quota | null> {
  const { data } = await supabase
    .from("user_quotas")
    .select("tier, api_keys_used, api_keys_limit, ai_analyses_used, ai_analyses_limit, quota_reset_at")
    .eq("user_id", userId)
    .single();
  return (data as Quota) ?? null;
}

export async function consumeAiAnalysis(
  supabase: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; quota: Quota | null; reason?: string }> {
  const quota = await getQuota(supabase, userId);
  if (!quota) return { allowed: false, quota: null, reason: "No quota record" };
  if (quota.tier === "free") return { allowed: false, quota, reason: "Upgrade required" };

  if (new Date(quota.quota_reset_at) < new Date()) {
    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(1);
    next.setUTCHours(0, 0, 0, 0);
    await supabase
      .from("user_quotas")
      .update({ ai_analyses_used: 0, quota_reset_at: next.toISOString() })
      .eq("user_id", userId);
    quota.ai_analyses_used = 0;
  }

  if (quota.ai_analyses_used >= quota.ai_analyses_limit) {
    return { allowed: false, quota, reason: "Monthly quota exhausted" };
  }

  await supabase
    .from("user_quotas")
    .update({ ai_analyses_used: quota.ai_analyses_used + 1 })
    .eq("user_id", userId);

  return { allowed: true, quota };
}
