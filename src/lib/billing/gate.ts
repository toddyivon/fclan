import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tier } from "./quota";

/** Feature gates per product spec (specs/spec.md). */
export const FEATURES = {
  live_telemetry: ["free", "pro", "ai_premium"],
  session_history_unlimited: ["pro", "ai_premium"],
  ai_analysis: ["pro", "ai_premium"],
  lap_comparison: ["pro", "ai_premium"],
  track_map: ["pro", "ai_premium"],
  tire_temps: ["pro", "ai_premium"],
  telemetry_export: ["pro", "ai_premium"],
  ghost_laps: ["ai_premium"],
  fuel_strategy: ["ai_premium"],
  ai_coaching: ["ai_premium"],
} as const satisfies Record<string, readonly Tier[]>;

export type Feature = keyof typeof FEATURES;

export const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, ai_premium: 2 };

export function tierHasFeature(tier: Tier, feature: Feature): boolean {
  return (FEATURES[feature] as readonly Tier[]).includes(tier);
}

/** Reads the caller's tier from public.users (RLS: own row only). */
export async function getUserTier(supabase: SupabaseClient, userId: string): Promise<Tier> {
  const { data } = await supabase.from("users").select("tier").eq("id", userId).single();
  return ((data?.tier as Tier) ?? "free");
}

/**
 * Convenience for route handlers: resolves tier and answers whether the
 * feature is available. Callers return 403 with `upgrade: true` when not.
 */
export async function checkFeature(
  supabase: SupabaseClient,
  userId: string,
  feature: Feature
): Promise<{ allowed: boolean; tier: Tier }> {
  const tier = await getUserTier(supabase, userId);
  return { allowed: tierHasFeature(tier, feature), tier };
}
