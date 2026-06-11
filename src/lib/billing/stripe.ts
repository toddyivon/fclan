import Stripe from "stripe";
import { serverEnv } from "@/env";

export const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;

/**
 * Single construction point for the Stripe client. STRIPE_API_HOST lets
 * tests point at stripe-mock (e.g. STRIPE_API_HOST=localhost:12111).
 */
export function getStripe(): Stripe {
  const key = serverEnv.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");

  const mockHost = process.env.STRIPE_API_HOST;
  if (mockHost) {
    const [host, port] = mockHost.split(":");
    return new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      host,
      port: port ? Number(port) : 443,
      protocol: "http",
    });
  }
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
