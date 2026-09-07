import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/env";
import { getStripe } from "@/lib/billing/stripe";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!serverEnv.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account for this user" }, { status: 400 });
  }

  const appUrl = serverEnv.APP_URL ?? req.nextUrl.origin;
  const stripe = getStripe();

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("billing/portal: stripe error", err);
    return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 });
  }
}
