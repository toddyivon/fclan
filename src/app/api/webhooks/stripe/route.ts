import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
  });
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function tierForPrice(priceId: string | null | undefined): "pro" | "ai_premium" | "free" {
  if (priceId === process.env.STRIPE_PRICE_AI_PREMIUM) return "ai_premium";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}

async function markProcessed(eventId: string, type: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: eventId, type });
  if (error) {
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }
  return true;
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

  let fresh: boolean;
  try {
    fresh = await markProcessed(event.id, event.type);
  } catch (err) {
    console.error("stripe: failed to record event", err);
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
  if (!fresh) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const subId = session.subscription as string | null;
        const userId = session.client_reference_id;

        if (!userId || !customerId) {
          console.warn("stripe: checkout.session.completed missing userId/customerId", { eventId: event.id });
          break;
        }

        const { data: owner } = await supabase
          .from("users")
          .select("id")
          .eq("id", userId)
          .single();
        if (!owner) {
          console.warn("stripe: unknown user on checkout", { userId, eventId: event.id });
          break;
        }

        await supabase.from("users")
          .update({ stripe_customer_id: customerId })
          .eq("id", userId);

        const priceId = session.line_items?.data?.[0]?.price?.id ?? null;
        const tier = tierForPrice(priceId);
        await supabase.from("users").update({ tier }).eq("id", userId);

        if (subId) {
          await supabase.from("stripe_subscriptions").insert({
            user_id: userId,
            stripe_sub_id: subId,
            status: "active",
            price_id: priceId,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const tier = tierForPrice(priceId);
        const currentPeriodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

        await supabase.from("stripe_subscriptions").update({
          status: sub.status,
          price_id: priceId,
          current_period_end:
            sub.status === "active" && currentPeriodEnd
              ? new Date(currentPeriodEnd * 1000).toISOString()
              : null,
        }).eq("stripe_sub_id", sub.id);

        const { data: owner } = await supabase
          .from("users")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();
        if (owner) {
          await supabase.from("users").update({ tier }).eq("id", owner.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await supabase.from("stripe_subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_sub_id", sub.id);

        const { data: owner } = await supabase
          .from("users")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();
        if (owner) {
          await supabase.from("users").update({ tier: "free" }).eq("id", owner.id);
        }
        break;
      }
    }
  } catch (err) {
    console.error("stripe: handler error", { eventId: event.id, err });
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
