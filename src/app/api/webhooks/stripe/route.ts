import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/billing/stripe";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type Tier = "free" | "pro" | "ai_premium";

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, ai_premium: 2 };

function tierForPrice(priceId: string | null | undefined): Tier {
  if (
    priceId &&
    (priceId === process.env.STRIPE_PRICE_AI_PREMIUM ||
      priceId === process.env.STRIPE_PRICE_AI_PREMIUM_ANNUAL)
  ) {
    return "ai_premium";
  }
  if (
    priceId &&
    (priceId === process.env.STRIPE_PRICE_PRO || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL)
  ) {
    return "pro";
  }
  return "free";
}

/**
 * Recomputes the user's tier from ALL of their subscription rows, not from a
 * single event snapshot (a user can briefly hold two subscriptions, e.g.
 * after an upgrade flow — cancelling the old one must not clobber the tier
 * granted by the live one).
 *
 * - highest tier among active|trialing subscriptions wins (ai_premium > pro)
 * - none live but at least one past_due → keep the user's current tier (grace)
 * - otherwise free
 */
async function recomputeUserTier(supabase: SupabaseClient, userId: string): Promise<Tier> {
  const { data: subs, error } = await supabase
    .from("stripe_subscriptions")
    .select("status, price_id")
    .eq("user_id", userId);
  if (error) throw new Error(`stripe_subscriptions read failed: ${error.message}`);

  let best: Tier = "free";
  let hasLive = false;
  let hasPastDue = false;
  for (const row of subs ?? []) {
    if (row.status === "active" || row.status === "trialing") {
      hasLive = true;
      const tier = tierForPrice(row.price_id);
      if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
    } else if (row.status === "past_due") {
      hasPastDue = true;
    }
  }

  if (hasLive) return best;

  if (hasPastDue) {
    // Grace period: don't downgrade while Stripe retries payment.
    const { data: u, error: userError } = await supabase
      .from("users")
      .select("tier")
      .eq("id", userId)
      .maybeSingle();
    if (userError) throw new Error(`users tier read failed: ${userError.message}`);
    const current = u?.tier;
    if (current === "pro" || current === "ai_premium") return current;
  }

  return "free";
}

/**
 * On API version 2026-03-25 (post-basil) `current_period_end` lives on the
 * subscription item, not the subscription. Fall back to top-level for safety.
 */
function periodEndOf(sub: Stripe.Subscription): string | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  const topLevel = (sub as unknown as { current_period_end?: number }).current_period_end;
  const epoch = itemEnd ?? topLevel;
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Resolves the app user for a subscription: by stripe_customer_id first,
 * then by `sub.metadata.user_id` (subscription.* events can arrive before
 * checkout.session.completed has stored the customer id).
 */
async function findUserId(
  supabase: SupabaseClient,
  customerId: string | null,
  sub?: Stripe.Subscription
): Promise<string | null> {
  if (customerId) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(`users lookup by customer failed: ${error.message}`);
    if (data) return data.id;
  }

  const metaUserId = sub?.metadata?.user_id;
  if (metaUserId) {
    const { data, error } = await supabase
      .from("users")
      .select("id, stripe_customer_id")
      .eq("id", metaUserId)
      .maybeSingle();
    if (error) throw new Error(`users lookup by metadata failed: ${error.message}`);
    if (data) {
      if (customerId) {
        if (!data.stripe_customer_id) {
          // Backfill so later events resolve by customer id.
          const { error: backfillError } = await supabase
            .from("users")
            .update({ stripe_customer_id: customerId })
            .eq("id", data.id);
          if (backfillError) {
            console.error("stripe: failed to backfill stripe_customer_id", backfillError);
          }
        } else if (data.stripe_customer_id !== customerId) {
          console.warn("stripe: stripe_customer_id mismatch, not overwriting", {
            userId: data.id,
            existing: data.stripe_customer_id,
            incoming: customerId,
          });
        }
      }
      return data.id;
    }
  }

  return null;
}

async function upsertSubscriptionRow(
  supabase: SupabaseClient,
  row: {
    user_id: string;
    stripe_sub_id: string;
    status: string;
    price_id: string | null;
    current_period_end: string | null;
    last_event_at?: string;
  },
  options: { ignoreDuplicates?: boolean } = {}
): Promise<void> {
  // Events can arrive out of order — upsert keyed on stripe_sub_id.
  const { error } = await supabase
    .from("stripe_subscriptions")
    .upsert(row, { onConflict: "stripe_sub_id", ...options });
  if (error) throw new Error(`stripe_subscriptions upsert failed: ${error.message}`);
}

async function setUserTier(
  supabase: SupabaseClient,
  userId: string,
  tier: Tier
): Promise<void> {
  const { error } = await supabase.from("users").update({ tier }).eq("id", userId);
  if (error) throw new Error(`users tier update failed: ${error.message}`);
}

/** Shared by customer.subscription.created / updated / deleted. */
async function handleSubscriptionEvent(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
  eventId: string,
  eventCreated: number
): Promise<void> {
  const customerId = customerIdOf(sub.customer);
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;

  const userId = await findUserId(supabase, customerId, sub);
  if (!userId) {
    console.warn("stripe: no user for subscription event", {
      eventId,
      subId: sub.id,
      customerId,
    });
    return;
  }

  // Recency guard: a retried (stale) event must never overwrite newer state
  // written by an event created later.
  const { data: existing, error: existingError } = await supabase
    .from("stripe_subscriptions")
    .select("last_event_at")
    .eq("stripe_sub_id", sub.id)
    .maybeSingle();
  if (existingError) {
    throw new Error(`stripe_subscriptions lookup failed: ${existingError.message}`);
  }

  const eventMs = eventCreated * 1000;
  const stale =
    !!existing?.last_event_at && eventMs <= Date.parse(existing.last_event_at);

  if (stale) {
    console.warn("stripe: skipping stale subscription event", { eventId, subId: sub.id });
  } else {
    await upsertSubscriptionRow(supabase, {
      user_id: userId,
      stripe_sub_id: sub.id,
      status: sub.status,
      price_id: priceId,
      current_period_end: periodEndOf(sub),
      last_event_at: new Date(eventMs).toISOString(),
    });
  }

  const tier = await recomputeUserTier(supabase, userId);
  await setUserTier(supabase, userId, tier);
}

/** Shared by checkout.session.completed / checkout.session.async_payment_succeeded. */
async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<void> {
  const customerId = customerIdOf(session.customer);
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;

  if (!userId || !customerId) {
    console.warn("stripe: checkout.session.completed missing userId/customerId", { eventId });
    return;
  }

  const { data: owner, error: ownerError } = await supabase
    .from("users")
    .select("id, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (ownerError) throw new Error(`users lookup failed: ${ownerError.message}`);
  if (!owner) {
    console.warn("stripe: unknown user on checkout", { userId, eventId });
    return;
  }

  if (!owner.stripe_customer_id) {
    const { error: customerError } = await supabase
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
    if (customerError) {
      throw new Error(`users stripe_customer_id update failed: ${customerError.message}`);
    }
  } else if (owner.stripe_customer_id !== customerId) {
    console.warn("stripe: stripe_customer_id mismatch on checkout, not overwriting", {
      userId,
      existing: owner.stripe_customer_id,
      incoming: customerId,
    });
  }

  // Async payment methods complete checkout before the money arrives. Only
  // grant entitlements once paid; checkout.session.async_payment_succeeded
  // (routed to this same handler) finishes the job later.
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    console.warn("stripe: checkout not paid yet, waiting for async payment", {
      eventId,
      paymentStatus: session.payment_status,
    });
    return;
  }

  // line_items is NOT included in the webhook payload. Prefer the price we
  // stamped on session.metadata at checkout creation; only when that is
  // missing, retrieve the subscription (items expanded) to read the price.
  // The subscription.created/updated events that follow carry authoritative
  // status/period data, so skipping the retrieve here is safe.
  let priceId: string | null = session.metadata?.price_id ?? null;
  let sub: Stripe.Subscription | null = null;
  if (!priceId && subId) {
    sub = await getStripe().subscriptions.retrieve(subId, { expand: ["items.data.price"] });
    priceId = sub?.items?.data?.[0]?.price?.id ?? null;
  }

  if (subId) {
    // Insert-only: subscription.* events are the authoritative source for
    // status/period data — never clobber a row they already wrote.
    await upsertSubscriptionRow(
      supabase,
      {
        user_id: userId,
        stripe_sub_id: subId,
        status: sub?.status ?? "active",
        price_id: priceId,
        current_period_end: sub ? periodEndOf(sub) : null,
      },
      { ignoreDuplicates: true }
    );
  }

  const tier = await recomputeUserTier(supabase, userId);
  await setUserTier(supabase, userId, tier);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("stripe: invalid signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Idempotency: check for a previously processed event up front, but only
  // record the event AFTER the handler succeeds — otherwise a failed handler
  // turns Stripe's retry into a "duplicate" and the event is lost.
  const { data: existing, error: dupError } = await supabase
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (dupError) {
    console.error("stripe: idempotency check failed", dupError);
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(supabase, event.data.object, event.id);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(supabase, event.data.object, event.id, event.created);
        break;
    }
  } catch (err) {
    console.error("stripe: handler error", { eventId: event.id, type: event.type, err });
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  // Record success; a 23505 conflict just means a concurrent delivery won.
  const { error: recordError } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, type: event.type });
  if (recordError && (recordError as { code?: string }).code !== "23505") {
    console.error("stripe: failed to record processed event", { eventId: event.id, recordError });
  }

  return NextResponse.json({ received: true });
}
