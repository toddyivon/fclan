import { Badge } from "@/components/ui/badge";
import { tierLabel, type Tier } from "@/lib/rankings";
import { cn } from "@/lib/utils";

const TIER_STYLES: Record<Tier, string> = {
  bronze: "bg-amber-700/20 text-amber-500",
  silver: "bg-slate-400/20 text-slate-300",
  gold: "bg-yellow-400/20 text-yellow-300",
  platinum: "bg-cyan-400/20 text-cyan-300",
  diamond: "bg-primary/20 text-primary",
};

/** Compact tier pill for standings rows. Renders nothing without a tier. */
export function TierBadge({ tier, className }: { tier: Tier | null; className?: string }) {
  if (!tier) return null;
  return (
    <Badge className={cn(TIER_STYLES[tier], "text-[10px] uppercase tracking-wide", className)}>
      {tierLabel(tier)}
    </Badge>
  );
}
