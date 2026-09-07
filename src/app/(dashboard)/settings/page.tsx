import { Suspense } from "react";
import { CreditCard, Key, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getQuota } from "@/lib/billing/quota";
import { ApiKeysSection } from "./api-keys-section";
import { BillingSection } from "./billing-section";
import { ProfileSection } from "./profile-section";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let tier = "free";
  let hasCustomer = false;
  let aiUsed = 0;
  let aiLimit = 0;
  let quotaResetAt: string | null = null;
  let subscriptionStatus: string | null = null;
  let currentPeriodEnd: string | null = null;
  let displayName = "";

  if (user) {
    const [{ data: profile }, quota, { data: subscription }] = await Promise.all([
      supabase.from("users").select("tier, stripe_customer_id, name").eq("id", user.id).single(),
      getQuota(supabase, user.id),
      supabase
        .from("stripe_subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    tier = profile?.tier ?? "free";
    hasCustomer = Boolean(profile?.stripe_customer_id);
    displayName = profile?.name ?? "";
    aiUsed = quota?.ai_analyses_used ?? 0;
    aiLimit = quota?.ai_analyses_limit ?? 0;
    quotaResetAt = quota?.quota_reset_at ?? null;
    subscriptionStatus = subscription?.status ?? null;
    currentPeriodEnd = subscription?.current_period_end ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and mobile app configuration.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user ? (
            <ProfileSection userId={user.id} initialName={displayName} />
          ) : (
            <p className="text-sm text-muted-foreground">Sign in to edit your profile.</p>
          )}
        </CardContent>
      </Card>

      {/* Plan & Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Plan &amp; Billing
          </CardTitle>
          <CardDescription>Your subscription, AI analysis quota, and payment details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <BillingSection
              tier={tier}
              aiUsed={aiUsed}
              aiLimit={aiLimit}
              quotaResetAt={quotaResetAt}
              hasCustomer={hasCustomer}
              subscriptionStatus={subscriptionStatus}
              currentPeriodEnd={currentPeriodEnd}
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            API Keys
          </CardTitle>
          <CardDescription>Keys used to authenticate the mobile capture app.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeysSection />
        </CardContent>
      </Card>
    </div>
  );
}
