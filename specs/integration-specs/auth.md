# Supabase Auth Integration

## Provider
Supabase Auth (free tier included with database)

## Sign-in Methods
- Email + password
- Google OAuth
- GitHub OAuth

## Middleware
```ts
// middleware.ts
- Reads Supabase session from cookies
- Creates server client
- Injects user into request headers
- Protects routes under (dashboard), /api (except /api/ingest, /api/webhooks/stripe)
- Redirects unauthenticated users to /login
```

## Session Management
- Supabase SSR handles cookie refresh automatically
- Supabase client on server uses cookie-based auth
- Client components use `createBrowserClient` from `@supabase/ssr`
- Logout clears cookies → redirects to /

## Row Level Security
All data tables use `auth.uid()` for user isolation. Even if middleware fails, RLS prevents cross-user data access at the database level.
