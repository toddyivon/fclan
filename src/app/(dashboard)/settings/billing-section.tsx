"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, Sparkles, XCircle, Zap } from "lucide-react";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  ai_premium: "AI Premium",
};

const UNLIMITED_THRESHOLD = 999999;

interface BillingSectionProps {
  tier: string;
  aiUsed: number;
  aiLimit: number;
  quotaResetAt: string | null;
  hasCustomer: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export function BillingSection({
  tier,
  aiUsed,
  aiLimit,
  quotaResetAt,
  hasCustomer,
  subscriptionStatus,
  currentPeriodEnd,
}: BillingSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  const plan = searchParams.get("plan");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoCheckoutFiredRef = useRef(false);

  const go = useCallback(async (path: string, body?: Record<string, string>) => {
    setError(null);
    setPending(body?.plan ?? "portal");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setPending(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setPending(null);
    }
  }, []);

  // Signup propagates ?plan=pro|ai_premium here ("Start Free Trial" flow).
  // Consume it once: clear the param, then send free-tier users straight to checkout.
  useEffect(() => {
    if (autoCheckoutFiredRef.current) return;
    if (plan !== "pro" && plan !== "ai_premium") return;
    autoCheckoutFiredRef.current = true;
    router.replace("/settings");
    if (tier === "free") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot checkout kick-off guarded by ref
      void go("/api/billing/checkout", { plan });
    }
  }, [plan, tier, router, go]);

  const unlimited = aiLimit >= UNLIMITED_THRESHOLD;
  const pct = unlimited || aiLimit <= 0 ? 0 : Math.min(100, Math.round((aiUsed / aiLimit) * 100));
  const isPaid = tier === "pro" || tier === "ai_premium";

  return (
    <div className="space-y-5">
      {checkout === "success" && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div className="text-sm">
            <p className="font-medium text-emerald-300">Subscription activated</p>
            <p className="text-muted-foreground">
              Thanks for upgrading! It can take a few seconds for your plan to update.
            </p>
          </div>
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
          <XCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">Checkout cancelled</p>
            <p className="text-muted-foreground">No charges were made. You can upgrade anytime.</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Current plan</span>
        <Badge
          className={
            isPaid
              ? "bg-primary hover:bg-primary text-white"
              : "bg-white/10 hover:bg-white/10 text-white"
          }
        >
          {TIER_LABELS[tier] ?? tier}
        </Badge>
        {subscriptionStatus === "trialing" && (
          <span className="text-xs text-primary">Free trial</span>
        )}
        {subscriptionStatus === "past_due" && (
          <span className="text-xs text-amber-400">Payment past due</span>
        )}
      </div>

      <div className="space-y-2 max-w-md">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">AI analyses this month</span>
          <span className="font-medium">
            {unlimited ? `${aiUsed} / Unlimited` : `${aiUsed} / ${aiLimit}`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: unlimited ? "100%" : `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {quotaResetAt ? (
            <span>Resets {new Date(quotaResetAt).toLocaleDateString()}</span>
          ) : (
            <span />
          )}
          {currentPeriodEnd && (
            <span>Renews {new Date(currentPeriodEnd).toLocaleDateString()}</span>
          )}
        </div>
        {tier === "free" && (
          <p className="text-xs text-muted-foreground">
            AI analysis requires a Pro or AI Premium plan.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {tier === "free" && (
          <>
            <Button
              className="bg-primary hover:bg-primary"
              disabled={pending !== null}
              onClick={() => go("/api/billing/checkout", { plan: "pro" })}
            >
              <Zap className="mr-2 h-4 w-4" />
              {pending === "pro" ? "Redirecting…" : "Upgrade to Pro — $9.99/mo"}
            </Button>
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10"
              disabled={pending !== null}
              onClick={() => go("/api/billing/checkout", { plan: "ai_premium" })}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {pending === "ai_premium" ? "Redirecting…" : "Upgrade to AI Premium — $24.99/mo"}
            </Button>
          </>
        )}
        {tier === "pro" && (
          <Button
            className="bg-primary hover:bg-primary"
            disabled={pending !== null}
            onClick={() => go("/api/billing/checkout", { plan: "ai_premium" })}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {pending === "ai_premium" ? "Redirecting…" : "Upgrade to AI Premium"}
          </Button>
        )}
        {hasCustomer && (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => go("/api/billing/portal")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {pending === "portal" ? "Redirecting…" : "Manage subscription"}
          </Button>
        )}
      </div>
    </div>
  );
}
