# GT7 Telemetry SaaS — Setup Guide

## 1. Supabase
- Create a Supabase project at https://supabase.com
- Copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from project settings
- Run the SQL migration: `supabase/migrations/001_initial.sql` in the Supabase SQL editor

## 2. Database URL
Add `DATABASE_URL=postgresql://<project-ref>:<password>@db.<project-ref>.supabase.co:6543/postgres` for Drizzle

## 3. Stripe
- Create a Stripe account
- Create two products: "Pro" ($9.99/mo) and "AI Premium" ($24.99/mo)
- Set `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`
- Set `STRIPE_PRICE_PRO` and `STRIPE_PRICE_AI_PREMIUM` to the price IDs
- Add webhook endpoint `https://your-domain/api/webhooks/stripe` and copy the webhook secret to `STRIPE_WEBHOOK_SECRET`

## 4. OpenAI
- Get an API key from https://platform.openai.com
- Set `OPENAI_API_KEY`

## 5. Environment
Copy `.env.example` to `.env.local` and fill in all values.

## 6. Run
```bash
npm run dev
```

## 7. Mobile App
```bash
cd mobile-app
npm install
npx expo install expo-dev-client
npx expo run:ios   # or android
```

Note: The mobile app requires `npx expo prebuild` for native modules (react-native-udp). See the Expo docs for dev client setup.
