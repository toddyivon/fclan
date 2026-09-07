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

export interface ConsumeResult {
  allowed: boolean;
  used?: number;
  limit?: number;
  tier?: Tier;
  reset_at?: string;
  reason?: "upgrade_required" | "quota_exhausted" | "no_quota_record" | "rpc_error";
}

export async function getQuota(supabase: SupabaseClient, userId: string): Promise<Quota | null> {
  const { data } = await supabase
    .from("user_quotas")
    .select("tier, api_keys_used, api_keys_limit, ai_analyses_used, ai_analyses_limit, quota_reset_at")
    .eq("user_id", userId)
    .single();
  return (data as Quota) ?? null;
}

/**
 * Atomically takes one AI-analysis unit via the `consume_ai_quota` RPC
 * (monthly reset + limit check + increment in a single statement).
 * Must be called with the service-role client — the function is not
 * executable by anon/authenticated roles.
 */
export async function consumeAiAnalysis(
  service: SupabaseClient,
  userId: string
): Promise<ConsumeResult> {
  const { data, error } = await service.rpc("consume_ai_quota", { p_user_id: userId });
  if (error) {
    console.error("consume_ai_quota rpc failed", error);
    return { allowed: false, reason: "rpc_error" };
  }
  return data as ConsumeResult;
}

/**
 * Refunds one AI-analysis unit (used when the model call fails after the
 * quota was consumed, so users are only charged for successful analyses).
 */
export async function refundAiAnalysis(service: SupabaseClient, userId: string): Promise<void> {
  const { error } = await service.rpc("refund_ai_quota", { p_user_id: userId });
  if (error) console.error("refund_ai_quota rpc failed", error);
}
