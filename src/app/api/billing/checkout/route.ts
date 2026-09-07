import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/env";
import { getStripe } from "@/lib/billing/stripe";

const PLANS = ["pro", "ai_premium"] as const;
type Plan = (typeof PLANS)[number];
const INTERVALS = ["month", "year"] as const;
type Interval = (typeof INTERVALS)[number];

function resolvePriceId(plan: Plan, interval: Interval): { priceId?: string; error?: string; status?: number } {
  if (interval === "year") {
    const priceId =
      plan === "pro" ? serverEnv.STRIPE_PRICE_PRO_ANNUAL : serverEnv.STRIPE_PRICE_AI_PREMIUM_ANNUAL;
    if (!priceId) return { error: "Annual billing is not available for this plan", status: 400 };
    return { priceId };
  }
  const priceId = plan === "pro" ? serverEnv.STRIPE_PRICE_PRO : serverEnv.STRIPE_PRICE_AI_PREMIUM;
  if (!priceId) return { error: "Billing is not configured", status: 500 };
  return { priceId };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!serverEnv.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const plan = body.plan as Plan;
  const interval = (body.interval ?? "month") as Interval;

  if (!PLANS.includes(plan)) {
    return NextResponse.json({ error: "plan must be 'pro' or 'ai_premium'" }, { status: 400 });
  }
  if (!INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "interval must be 'month' or 'year'" }, { status: 400 });
  }

  const { priceId, error: priceError, status: priceStatus } = resolvePriceId(plan, interval);
  if (!priceId) {
    return NextResponse.json({ error: priceError }, { status: priceStatus });
  }

  // Own row via RLS.
  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single();

  // All of the user's subscriptions (RLS: own rows) — used both to block a
  // second concurrent subscription and to gate the 7-day trial.
  const { data: subRows, error: subError } = await supabase
    .from("stripe_subscriptions")
    .select("status")
    .eq("user_id", user.id);
  if (subError) {
    console.error("billing/checkout: failed to read subscriptions", subError);
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
  const eligibleForTrial = (subRows ?? []).length === 0;
  const hasLiveSubscription = (subRows ?? []).some(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due"
  );

  const appUrl = serverEnv.APP_URL ?? req.nextUrl.origin;
  const stripe = getStripe();

  // Never create a second subscription (double-billing). Plan changes go
  // through the Billing Portal instead.
  if (hasLiveSubscription) {
    if (profile?.stripe_customer_id) {
      try {
        const portal = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${appUrl}/settings`,
        });
        return NextResponse.json({ url: portal.url, portal: true });
      } catch (err) {
        console.error("billing/checkout: portal error", err);
        return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "subscription_exists" }, { status: 409 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: user.id,
      metadata: { user_id: user.id, price_id: priceId },
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { user_id: user.id },
        ...(eligibleForTrial ? { trial_period_days: 7 } : {}),
      },
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: profile?.email ?? user.email }),
      success_url: `${appUrl}/settings?checkout=success`,
      cancel_url: `${appUrl}/settings?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("billing/checkout: stripe error", err);
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}
