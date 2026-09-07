# Billing API Contracts

## POST /api/billing/checkout
Auth: Supabase session cookie (user auth)

Creates a Stripe Checkout session (mode `subscription`) and returns the hosted checkout URL.

Request body:
```json
{
  "plan": "pro",
  "interval": "month"
}
```
- `plan` (required): `"pro"` | `"ai_premium"`.
- `interval` (optional, default `"month"`): `"month"` | `"year"`. Yearly requires the
  `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_AI_PREMIUM_ANNUAL` env vars; if the annual
  price is not configured the request fails with 400.

Behavior:
- Price resolved from `STRIPE_PRICE_PRO` / `STRIPE_PRICE_AI_PREMIUM` (or `*_ANNUAL`).
- `client_reference_id` = user id; `metadata` = `{ user_id, price_id }`;
  `subscription_data.metadata.user_id` = user id (lets the webhook resolve the user even
  when `customer.subscription.*` events arrive before `checkout.session.completed`).
- `trial_period_days: 7` is applied ONLY if the user has never had a row in
  `stripe_subscriptions` (first subscription ever).
- Reuses `users.stripe_customer_id` as `customer` when present; otherwise sends
  `customer_email`.
- `success_url` = `{APP_URL}/settings?checkout=success`,
  `cancel_url` = `{APP_URL}/settings?checkout=cancelled`
  (`APP_URL` env, falling back to the request origin).

Response `200`:
```json
{ "url": "https://checkout.stripe.com/c/pay/cs_..." }
```

Errors:
- `400` — invalid `plan` / `interval`, or annual price not configured:
  `{ "error": "Annual billing is not available for this plan" }`
- `401` — not authenticated: `{ "error": "Unauthorized" }`
- `500` — Stripe not configured, monthly price missing, or Stripe API failure:
  `{ "error": "Failed to start checkout" }`

---

## POST /api/billing/portal
Auth: Supabase session cookie (user auth)

Creates a Stripe Billing Portal session for the caller's Stripe customer.

Request body: none.

Response `200`:
```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

Errors:
- `400` — user has no `stripe_customer_id` (never checked out):
  `{ "error": "No billing account for this user" }`
- `401` — not authenticated.
- `500` — Stripe not configured or Stripe API failure:
  `{ "error": "Failed to open billing portal" }`

`return_url` is `{APP_URL}/settings`.

---

## GET /api/me
Auth: Supabase session cookie (user auth)

Returns the caller's profile, quota, and latest subscription. All reads use the
cookie-authed client, so RLS scopes every query to the caller's own rows
(`users`, `user_quotas`, `stripe_subscriptions`).

Response `200`:
```json
{
  "user": {
    "id": "uuid",
    "email": "driver@example.com",
    "name": "Driver",
    "tier": "pro",
    "role": "user"
  },
  "quota": {
    "ai_analyses_used": 12,
    "ai_analyses_limit": 50,
    "api_keys_used": 2,
    "api_keys_limit": 5,
    "quota_reset_at": "2026-07-01T00:00:00Z"
  },
  "subscription": {
    "status": "active",
    "price_id": "price_...",
    "current_period_end": "2026-07-10T00:00:00Z"
  }
}
```

- `quota` is `null` if no `user_quotas` row exists (should not happen — the
  `sync_user_quota_tier` trigger seeds it).
- `subscription` is `null` for users who never subscribed. When multiple rows exist,
  the most recently created one is returned.

Errors:
- `401` — not authenticated.
- `404` — no `users` row for the authenticated id: `{ "error": "User profile not found" }`

---

## Webhook notes (POST /api/webhooks/stripe)

Not a public contract, but relevant behavior:

- Handles `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`.
- Idempotency: duplicate `event.id`s are detected via `stripe_webhook_events`
  (checked before processing, recorded only after the handler succeeds, so failed
  handlers are retried by Stripe instead of being swallowed as duplicates).
- Tier mapping: `active`/`trialing` → tier of the price; `canceled`/`unpaid`/
  `incomplete_expired` → `free`; `past_due` keeps the current tier (grace period).
- `current_period_end` is read from `subscription.items.data[0].current_period_end`
  (API version 2026-03-25 moved it off the subscription top level).
- `stripe_subscriptions` rows are upserted on `stripe_sub_id` (events may arrive
  out of order).
